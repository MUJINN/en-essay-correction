#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据库模型定义
SQLAlchemy ORM模型，用于存储OCR数据、批改结果和历史记录
"""

from sqlalchemy import Column, String, DateTime, Text, Float, Boolean, Integer, ForeignKey, Table
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

Base = declarative_base()


class OCRDataModel(Base):
    """OCR数据表"""
    __tablename__ = "ocr_data"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    image_id = Column(String, index=True, nullable=False)
    boxes_json = Column(Text, nullable=False)  # JSON格式存储boxes_data
    full_text = Column(Text, nullable=False)
    confidence_avg = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.now)

    # 关联关系
    history_records = relationship("HistoryRecordModel", back_populates="ocr_data")


class CorrectionResultModel(Base):
    """批改结果表"""
    __tablename__ = "correction_results"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workflow_run_id = Column(String, index=True, nullable=False)
    task_key = Column(String, index=True)
    score = Column(Float, default=0.0)
    outputs_json = Column(Text, nullable=False)  # JSON格式存储outputs
    intelligent_annotation_json = Column(Text)  # JSON格式存储智能标注
    ocr_annotation_match_json = Column(Text)  # JSON格式存储OCR匹配结果
    elapsed_time = Column(Float, default=0.0)
    total_tokens = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.now)

    # 关联关系
    history_records = relationship("HistoryRecordModel", back_populates="correction_result")


class HistoryRecordModel(Base):
    """历史记录表（主表）"""
    __tablename__ = "history_records"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    task_key = Column(String, index=True)
    grade = Column(String)
    subject_chs = Column(String)
    question_content = Column(Text)
    total_score = Column(String)
    student_answer = Column(Text)
    breakdown_type = Column(String)

    # 图片数据（Base64编码）
    image_data = Column(Text)

    # 外键关联
    ocr_data_id = Column(String, ForeignKey("ocr_data.id"))
    correction_result_id = Column(String, ForeignKey("correction_results.id"))

    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    is_deleted = Column(Boolean, default=False)

    # 关联关系
    ocr_data = relationship("OCRDataModel", back_populates="history_records")
    correction_result = relationship("CorrectionResultModel", back_populates="history_records")


class BatchTaskModel(Base):
    """批量任务表"""
    __tablename__ = "batch_tasks"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    task_name = Column(String, index=True)
    total_count = Column(Integer, default=0)
    completed_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    status = Column(String, default="pending")  # pending, processing, completed, failed
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    completed_at = Column(DateTime)


class BatchTaskItemModel(Base):
    """批量任务项表"""
    __tablename__ = "batch_task_items"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    batch_task_id = Column(String, ForeignKey("batch_tasks.id"))
    student_answer = Column(Text)
    question_content = Column(Text)
    grade = Column(String)
    status = Column(String, default="pending")  # pending, processing, completed, failed
    error_message = Column(Text)
    history_record_id = Column(String, ForeignKey("history_records.id"))
    created_at = Column(DateTime, default=datetime.now)
    completed_at = Column(DateTime)

    # 关联关系
    batch_task = relationship("BatchTaskModel")
    history_record = relationship("HistoryRecordModel")
