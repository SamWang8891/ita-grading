"""Pydantic schemas for API request / response validation."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


# ─── Auth ───────────────────────────────────────────────────────────────

class IdentifyIn(BaseModel):
    identifier: str = Field(min_length=1, max_length=32)


class PasswordIn(BaseModel):
    identifier: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=1, max_length=128)


class TeacherPasswordChangeIn(BaseModel):
    old_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=4, max_length=128)


# ─── Scores ─────────────────────────────────────────────────────────────

class Scores(BaseModel):
    topic: int = Field(ge=0, le=30)
    content: int = Field(ge=0, le=30)
    narrative: int = Field(ge=0, le=20)
    presentation: int = Field(ge=0, le=10)
    teamwork: int = Field(ge=0, le=10)

    @property
    def total(self) -> int:
        return self.topic + self.content + self.narrative + self.presentation + self.teamwork


class SubmissionIn(BaseModel):
    period: str = Field(min_length=1, max_length=32)
    target_student_id: str = Field(min_length=1, max_length=32)
    scores: Scores
    comment: str = Field(default="", max_length=4000)
    self_note: str = Field(default="", max_length=4000)


# ─── JSON I/O (shared shape for single & batch) ─────────────────────────

class JsonEntry(BaseModel):
    target_student_id: str = Field(min_length=1, max_length=32)
    target_name: Optional[str] = None
    scores: Scores
    comment: str = Field(default="", max_length=4000)


class JsonPayload(BaseModel):
    period: str = Field(min_length=1, max_length=32)
    entries: List[JsonEntry]

    @field_validator("entries")
    @classmethod
    def non_empty(cls, v: "List[JsonEntry]") -> "List[JsonEntry]":
        if not v:
            raise ValueError("entries must not be empty")
        return v


# ─── Admin DTOs ─────────────────────────────────────────────────────────

class StudentIn(BaseModel):
    student_id: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=64)
    class_name: str = Field(min_length=1, max_length=64)


class StudentsImportIn(BaseModel):
    students: List[StudentIn]

    @field_validator("students")
    @classmethod
    def non_empty(cls, v: "List[StudentIn]") -> "List[StudentIn]":
        if not v:
            raise ValueError("students must not be empty")
        if len(v) > 2000:
            raise ValueError("too many rows (max 2000)")
        return v


class StudentPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=64)
    class_name: Optional[str] = Field(default=None, min_length=1, max_length=64)


class TeacherIn(BaseModel):
    username: str = Field(min_length=1, max_length=32)
    display_name: str = Field(min_length=1, max_length=64)
    initial_password: str = Field(min_length=4, max_length=128)


class TeacherPasswordResetIn(BaseModel):
    new_password: str = Field(min_length=4, max_length=128)


class PeriodPatch(BaseModel):
    is_open: bool
