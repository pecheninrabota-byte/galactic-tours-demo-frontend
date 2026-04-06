from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "galactic_tours.db"


# =========================
# DB
# =========================

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_tasks_db() -> None:
    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            creator_login TEXT NOT NULL,
            creator_name TEXT DEFAULT '',
            assignee_login TEXT DEFAULT '',
            assignee_name TEXT DEFAULT '',
            co_assignee_login TEXT DEFAULT '',
            co_assignee_name TEXT DEFAULT '',
            observer_login TEXT DEFAULT '',
            observer_name TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            deadline TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'new',
            priority TEXT NOT NULL DEFAULT 'medium',
            updated_at TEXT NOT NULL
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS task_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            author_login TEXT NOT NULL,
            author_name TEXT DEFAULT '',
            body TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS task_status_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            old_status TEXT DEFAULT '',
            new_status TEXT NOT NULL,
            changed_by_login TEXT NOT NULL,
            changed_by_name TEXT DEFAULT '',
            changed_at TEXT NOT NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
        """
    )

    conn.commit()
    conn.close()


init_tasks_db()


# =========================
# Types
# =========================

TaskStatus = Literal["new", "in_progress", "completed"]
TaskPriority = Literal["low", "medium", "high", "critical"]


# =========================
# Helpers
# =========================

def now_iso() -> str:
    return datetime.utcnow().isoformat()


def clean_text(value: Optional[str]) -> str:
    return (value or "").strip()


def normalize_role(value: Optional[str]) -> str:
    role = clean_text(value).lower()
    if role not in {"admin", "employee", "editor"}:
        return "employee"
    return role


def normalize_status(value: Optional[str]) -> str:
    status = clean_text(value).lower()
    if status not in {"new", "in_progress", "completed"}:
        raise HTTPException(status_code=400, detail="Invalid task status")
    return status


def normalize_priority(value: Optional[str]) -> str:
    priority = clean_text(value).lower()
    if priority not in {"low", "medium", "high", "critical"}:
        raise HTTPException(status_code=400, detail="Invalid task priority")
    return priority


def parse_user_context(
    x_user_login: Optional[str],
    x_user_name: Optional[str],
    x_user_role: Optional[str],
) -> dict[str, str]:
    user_login = clean_text(x_user_login)
    user_name = clean_text(x_user_name)
    user_role = normalize_role(x_user_role)

    if not user_login:
        raise HTTPException(status_code=401, detail="Missing X-User-Login header")

    return {
        "login": user_login,
        "name": user_name or user_login,
        "role": user_role,
    }


def get_task_or_404(conn: sqlite3.Connection, task_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    return row


def task_is_visible_to_user(task_row: sqlite3.Row, user_login: str, user_role: str) -> bool:
    if user_role == "admin":
        return True

    user_login = clean_text(user_login)

    participants = {
        clean_text(task_row["creator_login"]),
        clean_text(task_row["assignee_login"]),
        clean_text(task_row["co_assignee_login"]),
        clean_text(task_row["observer_login"]),
    }

    return user_login in participants


def can_edit_task(task_row: sqlite3.Row, user_login: str, user_role: str) -> bool:
    if user_role == "admin":
        return True
    return clean_text(user_login) == clean_text(task_row["creator_login"])


def can_change_task_status(task_row: sqlite3.Row, user_login: str, user_role: str) -> bool:
    if user_role == "admin":
        return True

    user_login = clean_text(user_login)
    creator_login = clean_text(task_row["creator_login"])
    assignee_login = clean_text(task_row["assignee_login"])

    return user_login in {creator_login, assignee_login}


def get_comments_for_task(conn: sqlite3.Connection, task_id: int) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT id, task_id, author_login, author_name, body, created_at
        FROM task_comments
        WHERE task_id = ?
        ORDER BY created_at ASC, id ASC
        """,
        (task_id,),
    ).fetchall()

    return [
        {
            "id": row["id"],
            "task_id": row["task_id"],
            "author_login": row["author_login"],
            "author_name": row["author_name"],
            "body": row["body"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def get_status_history_for_task(conn: sqlite3.Connection, task_id: int) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT id, task_id, old_status, new_status, changed_by_login, changed_by_name, changed_at
        FROM task_status_history
        WHERE task_id = ?
        ORDER BY changed_at ASC, id ASC
        """,
        (task_id,),
    ).fetchall()

    return [
        {
            "id": row["id"],
            "task_id": row["task_id"],
            "old_status": row["old_status"],
            "new_status": row["new_status"],
            "changed_by_login": row["changed_by_login"],
            "changed_by_name": row["changed_by_name"],
            "changed_at": row["changed_at"],
        }
        for row in rows
    ]


def build_participants(task_row: sqlite3.Row) -> dict[str, Optional[dict[str, str]]]:
    def build(login_key: str, name_key: str, role: str) -> Optional[dict[str, str]]:
        login = clean_text(task_row[login_key])
        name = clean_text(task_row[name_key])

        if not login:
            return None

        return {
            "role": role,
            "login": login,
            "name": name or login,
        }

    return {
        "creator": build("creator_login", "creator_name", "creator"),
        "assignee": build("assignee_login", "assignee_name", "assignee"),
        "co_assignee": build("co_assignee_login", "co_assignee_name", "co_assignee"),
        "observer": build("observer_login", "observer_name", "observer"),
    }


def serialize_task(conn: sqlite3.Connection, task_row: sqlite3.Row) -> dict[str, Any]:
    comments = get_comments_for_task(conn, task_row["id"])
    status_history = get_status_history_for_task(conn, task_row["id"])
    participants = build_participants(task_row)

    return {
        "id": task_row["id"],
        "title": task_row["title"],
        "description": task_row["description"],
        "status": task_row["status"],
        "priority": task_row["priority"],
        "created_at": task_row["created_at"],
        "updated_at": task_row["updated_at"],
        "deadline": task_row["deadline"],
        "creator_login": task_row["creator_login"],
        "creator_name": task_row["creator_name"],
        "assignee_login": task_row["assignee_login"],
        "assignee_name": task_row["assignee_name"],
        "co_assignee_login": task_row["co_assignee_login"],
        "co_assignee_name": task_row["co_assignee_name"],
        "observer_login": task_row["observer_login"],
        "observer_name": task_row["observer_name"],
        "participants": participants,
        "comments": comments,
        "comments_count": len(comments),
        "status_history": status_history,
    }


# =========================
# Schemas
# =========================

class TaskCreatePayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)
    assignee_login: str = Field(default="", max_length=120)
    assignee_name: str = Field(default="", max_length=200)
    co_assignee_login: str = Field(default="", max_length=120)
    co_assignee_name: str = Field(default="", max_length=200)
    observer_login: str = Field(default="", max_length=120)
    observer_name: str = Field(default="", max_length=200)
    deadline: str = Field(default="", max_length=50)
    priority: TaskPriority = "medium"


class TaskUpdatePayload(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=10000)
    assignee_login: Optional[str] = Field(default=None, max_length=120)
    assignee_name: Optional[str] = Field(default=None, max_length=200)
    co_assignee_login: Optional[str] = Field(default=None, max_length=120)
    co_assignee_name: Optional[str] = Field(default=None, max_length=200)
    observer_login: Optional[str] = Field(default=None, max_length=120)
    observer_name: Optional[str] = Field(default=None, max_length=200)
    deadline: Optional[str] = Field(default=None, max_length=50)
    priority: Optional[TaskPriority] = None


class TaskCommentPayload(BaseModel):
    body: str = Field(..., min_length=1, max_length=5000)


class TaskStatusPayload(BaseModel):
    status: TaskStatus


# =========================
# Routes
# =========================

@router.get("")
def list_tasks(
    status: Optional[str] = Query(default=None),
    search: str = Query(default=""),
    mine: bool = Query(default=False),
    x_user_login: Optional[str] = Header(default=None),
    x_user_name: Optional[str] = Header(default=None),
    x_user_role: Optional[str] = Header(default=None),
):
    user = parse_user_context(x_user_login, x_user_name, x_user_role)
    conn = get_db()

    sql = """
        SELECT *
        FROM tasks
        WHERE 1=1
    """
    params: list[Any] = []

    if status:
        sql += " AND status = ?"
        params.append(normalize_status(status))

    search_value = clean_text(search)
    if search_value:
        sql += " AND (title LIKE ? OR description LIKE ?)"
        params.extend([f"%{search_value}%", f"%{search_value}%"])

    if user["role"] != "admin":
        sql += """
            AND (
                creator_login = ?
                OR assignee_login = ?
                OR co_assignee_login = ?
                OR observer_login = ?
            )
        """
        params.extend([user["login"], user["login"], user["login"], user["login"]])

    if mine:
        sql += """
            AND (
                creator_login = ?
                OR assignee_login = ?
                OR co_assignee_login = ?
                OR observer_login = ?
            )
        """
        params.extend([user["login"], user["login"], user["login"], user["login"]])

    sql += """
        ORDER BY
            CASE status
                WHEN 'in_progress' THEN 1
                WHEN 'new' THEN 2
                WHEN 'completed' THEN 3
                ELSE 4
            END,
            created_at DESC,
            id DESC
    """

    rows = conn.execute(sql, params).fetchall()
    result = [serialize_task(conn, row) for row in rows]
    conn.close()

    return {
        "items": result,
        "count": len(result),
    }


@router.get("/{task_id}")
def get_task(
    task_id: int,
    x_user_login: Optional[str] = Header(default=None),
    x_user_name: Optional[str] = Header(default=None),
    x_user_role: Optional[str] = Header(default=None),
):
    user = parse_user_context(x_user_login, x_user_name, x_user_role)
    conn = get_db()
    task = get_task_or_404(conn, task_id)

    if not task_is_visible_to_user(task, user["login"], user["role"]):
        conn.close()
        raise HTTPException(status_code=403, detail="Access denied")

    result = serialize_task(conn, task)
    conn.close()
    return result


@router.post("")
def create_task(
    payload: TaskCreatePayload,
    x_user_login: Optional[str] = Header(default=None),
    x_user_name: Optional[str] = Header(default=None),
    x_user_role: Optional[str] = Header(default=None),
):
    user = parse_user_context(x_user_login, x_user_name, x_user_role)
    conn = get_db()
    now = now_iso()

    title = clean_text(payload.title)
    description = clean_text(payload.description)
    assignee_login = clean_text(payload.assignee_login)
    assignee_name = clean_text(payload.assignee_name)
    co_assignee_login = clean_text(payload.co_assignee_login)
    co_assignee_name = clean_text(payload.co_assignee_name)
    observer_login = clean_text(payload.observer_login)
    observer_name = clean_text(payload.observer_name)
    deadline = clean_text(payload.deadline)
    priority = normalize_priority(payload.priority)

    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO tasks (
            title,
            description,
            creator_login,
            creator_name,
            assignee_login,
            assignee_name,
            co_assignee_login,
            co_assignee_name,
            observer_login,
            observer_name,
            created_at,
            deadline,
            status,
            priority,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            title,
            description,
            user["login"],
            user["name"],
            assignee_login,
            assignee_name,
            co_assignee_login,
            co_assignee_name,
            observer_login,
            observer_name,
            now,
            deadline,
            "new",
            priority,
            now,
        ),
    )
    task_id = cur.lastrowid

    cur.execute(
        """
        INSERT INTO task_status_history (
            task_id,
            old_status,
            new_status,
            changed_by_login,
            changed_by_name,
            changed_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            task_id,
            "",
            "new",
            user["login"],
            user["name"],
            now,
        ),
    )

    conn.commit()

    task = get_task_or_404(conn, task_id)
    result = serialize_task(conn, task)
    conn.close()
    return result


@router.put("/{task_id}")
def update_task(
    task_id: int,
    payload: TaskUpdatePayload,
    x_user_login: Optional[str] = Header(default=None),
    x_user_name: Optional[str] = Header(default=None),
    x_user_role: Optional[str] = Header(default=None),
):
    user = parse_user_context(x_user_login, x_user_name, x_user_role)
    conn = get_db()
    task = get_task_or_404(conn, task_id)

    if not can_edit_task(task, user["login"], user["role"]):
        conn.close()
        raise HTTPException(status_code=403, detail="Only creator or admin can edit task")

    title = clean_text(payload.title) if payload.title is not None else task["title"]
    description = clean_text(payload.description) if payload.description is not None else task["description"]
    assignee_login = clean_text(payload.assignee_login) if payload.assignee_login is not None else task["assignee_login"]
    assignee_name = clean_text(payload.assignee_name) if payload.assignee_name is not None else task["assignee_name"]
    co_assignee_login = clean_text(payload.co_assignee_login) if payload.co_assignee_login is not None else task["co_assignee_login"]
    co_assignee_name = clean_text(payload.co_assignee_name) if payload.co_assignee_name is not None else task["co_assignee_name"]
    observer_login = clean_text(payload.observer_login) if payload.observer_login is not None else task["observer_login"]
    observer_name = clean_text(payload.observer_name) if payload.observer_name is not None else task["observer_name"]
    deadline = clean_text(payload.deadline) if payload.deadline is not None else task["deadline"]
    priority = normalize_priority(payload.priority) if payload.priority is not None else task["priority"]
    updated_at = now_iso()

    conn.execute(
        """
        UPDATE tasks
        SET
            title = ?,
            description = ?,
            assignee_login = ?,
            assignee_name = ?,
            co_assignee_login = ?,
            co_assignee_name = ?,
            observer_login = ?,
            observer_name = ?,
            deadline = ?,
            priority = ?,
            updated_at = ?
        WHERE id = ?
        """,
        (
            title,
            description,
            assignee_login,
            assignee_name,
            co_assignee_login,
            co_assignee_name,
            observer_login,
            observer_name,
            deadline,
            priority,
            updated_at,
            task_id,
        ),
    )

    conn.commit()

    updated_task = get_task_or_404(conn, task_id)
    result = serialize_task(conn, updated_task)
    conn.close()
    return result


@router.post("/{task_id}/comments")
def add_comment(
    task_id: int,
    payload: TaskCommentPayload,
    x_user_login: Optional[str] = Header(default=None),
    x_user_name: Optional[str] = Header(default=None),
    x_user_role: Optional[str] = Header(default=None),
):
    user = parse_user_context(x_user_login, x_user_name, x_user_role)
    conn = get_db()
    task = get_task_or_404(conn, task_id)

    if not task_is_visible_to_user(task, user["login"], user["role"]):
        conn.close()
        raise HTTPException(status_code=403, detail="Access denied")

    body = clean_text(payload.body)
    created_at = now_iso()

    conn.execute(
        """
        INSERT INTO task_comments (
            task_id,
            author_login,
            author_name,
            body,
            created_at
        ) VALUES (?, ?, ?, ?, ?)
        """,
        (
            task_id,
            user["login"],
            user["name"],
            body,
            created_at,
        ),
    )

    conn.execute(
        """
        UPDATE tasks
        SET updated_at = ?
        WHERE id = ?
        """,
        (created_at, task_id),
    )

    conn.commit()

    updated_task = get_task_or_404(conn, task_id)
    result = serialize_task(conn, updated_task)
    conn.close()
    return result


@router.post("/{task_id}/status")
def change_task_status(
    task_id: int,
    payload: TaskStatusPayload,
    x_user_login: Optional[str] = Header(default=None),
    x_user_name: Optional[str] = Header(default=None),
    x_user_role: Optional[str] = Header(default=None),
):
    user = parse_user_context(x_user_login, x_user_name, x_user_role)
    conn = get_db()
    task = get_task_or_404(conn, task_id)

    if not can_change_task_status(task, user["login"], user["role"]):
        conn.close()
        raise HTTPException(
            status_code=403,
            detail="Only admin, creator or assignee can change task status",
        )

    new_status = normalize_status(payload.status)
    old_status = task["status"]

    if old_status == new_status:
        result = serialize_task(conn, task)
        conn.close()
        return result

    changed_at = now_iso()

    conn.execute(
        """
        UPDATE tasks
        SET status = ?, updated_at = ?
        WHERE id = ?
        """,
        (new_status, changed_at, task_id),
    )

    conn.execute(
        """
        INSERT INTO task_status_history (
            task_id,
            old_status,
            new_status,
            changed_by_login,
            changed_by_name,
            changed_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            task_id,
            old_status,
            new_status,
            user["login"],
            user["name"],
            changed_at,
        ),
    )

    conn.commit()

    updated_task = get_task_or_404(conn, task_id)
    result = serialize_task(conn, updated_task)
    conn.close()
    return result


@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    x_user_login: Optional[str] = Header(default=None),
    x_user_name: Optional[str] = Header(default=None),
    x_user_role: Optional[str] = Header(default=None),
):
    user = parse_user_context(x_user_login, x_user_name, x_user_role)
    conn = get_db()
    task = get_task_or_404(conn, task_id)

    if not can_edit_task(task, user["login"], user["role"]):
        conn.close()
        raise HTTPException(status_code=403, detail="Only creator or admin can delete task")

    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()

    return {
        "ok": True,
        "message": "Task deleted",
        "task_id": task_id,
    }
