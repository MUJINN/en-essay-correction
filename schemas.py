#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pydantic数据模型
用于API请求和响应的数据验证
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class AnnotationType(str, Enum):
    """标注类型枚举"""
    NICE = "nice_sentence"
    GOOD = "good_sentence"
    IMPROVE = "improve_sentence"


# ========== OCR相关模型 ==========

class OCRBox(BaseModel):
    """OCR单个文本块"""
    text: str = Field(..., description="文本内容")
    bbox: List[float] = Field(..., description="边界框坐标 [x, y, w, h]")
    confidence: float = Field(0.0, description="置信度")
    index: int = Field(0, description="块索引")


class OCRResponse(BaseModel):
    """OCR识别结果"""
    success: bool = Field(..., description="是否成功")
    boxes_data: List[OCRBox] = Field(..., description="所有文本块")
    full_text: str = Field(..., description="完整文本")
    image_id: str = Field(..., description="图片唯一标识")
    created_at: datetime = Field(default_factory=datetime.now, description="创建时间")


# ========== 批改相关模型 ==========

class CorrectionRequest(BaseModel):
    """批改请求（重构版）"""
    task_key: str = Field("web-demo-task", description="任务键")
    grade: str = Field("", description="年级")
    subject_chs: str = Field("英语", description="科目")
    question_content: str = Field("", description="题目内容")
    total_score: str = Field("15", description="总分")
    student_answer: str = Field("", description="学生答案")
    breakdown_type: str = Field("", description="题型")
    # ✅ 新增：OCR相关字段
    ocr_data: Optional[OCRResponse] = Field(None, description="OCR识别结果")
    image_data: Optional[str] = Field(None, description="Base64图片数据")
    image_id: Optional[str] = Field(None, description="图片ID")


class IntelligentAnnotation(BaseModel):
    """智能标注结果"""
    nice_sentence: List[Dict[str, Any]] = Field(default_factory=list, description="精彩表达")
    good_sentence: List[Dict[str, Any]] = Field(default_factory=list, description="良好表达")
    improve_sentence: List[Dict[str, Any]] = Field(default_factory=list, description="待改进表达")
    highlight_count: Optional[int] = Field(None, description="高亮数量")
    improve_count: Optional[int] = Field(None, description="改进数量")


class OCRAnnotationMatch(BaseModel):
    """OCR与标注的匹配关系"""
    type: str = Field(..., description="标注类型")
    annotation: Dict[str, Any] = Field(..., description="标注内容")
    ocr_index: int = Field(..., description="OCR块索引")
    ocr_bbox: List[float] = Field(..., description="OCR边界框坐标")
    similarity: float = Field(..., description="相似度")
    matched_text: str = Field(..., description="匹配的文本")
    is_multi_block: bool = Field(False, description="是否多块匹配")
    ocr_indexes: List[int] = Field(default_factory=list, description="涉及的OCR索引列表")


class CorrectionResult(BaseModel):
    """批改结果"""
    workflow_run_id: str = Field(..., description="工作流运行ID")
    score: float = Field(..., description="总分")
    score_dimension: List[Dict[str, Any]] = Field(default_factory=list, description="评分维度")
    composition_basic_info: Dict[str, Any] = Field(default_factory=dict, description="作文基本信息")
    composition_overall_evaluation: Dict[str, Any] = Field(default_factory=dict, description="整体评价")
    intelligent_annotation: IntelligentAnnotation = Field(default_factory=IntelligentAnnotation, description="智能标注")
    ocr_annotation_match: List[OCRAnnotationMatch] = Field(default_factory=list, description="OCR匹配结果")
    elapsed_time: float = Field(..., description="执行时间")
    total_tokens: int = Field(..., description="Token消耗")


class CorrectionResponse(BaseModel):
    """批改API响应"""
    success: bool = Field(..., description="是否成功")
    data: Dict[str, Any] = Field(..., description="响应数据")


# ========== 历史记录相关模型 ==========

class HistoryRecord(BaseModel):
    """历史记录"""
    id: str = Field(..., description="记录ID")
    timestamp: datetime = Field(..., description="创建时间")
    task_key: str = Field(..., description="任务键")
    grade: str = Field(..., description="年级")
    subject_chs: str = Field(..., description="科目")
    question_content: str = Field(..., description="题目内容")
    total_score: str = Field(..., description="总分")
    student_answer: str = Field(..., description="学生答案")
    breakdown_type: str = Field(..., description="题型")
    # 关联数据
    ocr_data: Optional[OCRResponse] = Field(None, description="OCR数据")
    correction_result: Optional[CorrectionResult] = Field(None, description="批改结果")
    updated_at: Optional[datetime] = Field(None, description="更新时间")
    is_deleted: bool = Field(False, description="是否已删除")


class HistoryListResponse(BaseModel):
    """历史记录列表响应"""
    success: bool = Field(..., description="是否成功")
    data: Dict[str, Any] = Field(..., description="响应数据")


class HistoryDetailResponse(BaseModel):
    """历史记录详情响应"""
    success: bool = Field(..., description="是否成功")
    data: Dict[str, Any] = Field(..., description="响应数据")


# ========== 批量处理相关模型 ==========

class BatchTaskRequest(BaseModel):
    """批量任务请求"""
    task_name: str = Field(..., description="任务名称")
    items: List[Dict[str, Any]] = Field(..., description="任务项列表")


class BatchTaskItem(BaseModel):
    """批量任务项"""
    id: str = Field(..., description="任务项ID")
    student_answer: str = Field(..., description="学生答案")
    question_content: str = Field(..., description="题目内容")
    grade: str = Field(..., description="年级")
    status: str = Field(..., description="状态")
    error_message: Optional[str] = Field(None, description="错误信息")
    history_record_id: Optional[str] = Field(None, description="历史记录ID")
    created_at: datetime = Field(..., description="创建时间")
    completed_at: Optional[datetime] = Field(None, description="完成时间")


class BatchTask(BaseModel):
    """批量任务"""
    id: str = Field(..., description="任务ID")
    task_name: str = Field(..., description="任务名称")
    total_count: int = Field(..., description="总数量")
    completed_count: int = Field(..., description="已完成数量")
    failed_count: int = Field(..., description="失败数量")
    status: str = Field(..., description="状态")
    items: List[BatchTaskItem] = Field(default_factory=list, description="任务项列表")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: Optional[datetime] = Field(None, description="更新时间")
    completed_at: Optional[datetime] = Field(None, description="完成时间")


class BatchTaskResponse(BaseModel):
    """批量任务响应"""
    success: bool = Field(..., description="是否成功")
    data: Dict[str, Any] = Field(..., description="响应数据")


# ========== 分析统计相关模型 ==========

class StatisticsResponse(BaseModel):
    """统计数据响应"""
    success: bool = Field(..., description="是否成功")
    data: Dict[str, Any] = Field(..., description="响应数据")


# ========== 通用响应模型 ==========

class ApiResponse(BaseModel):
    """通用API响应"""
    success: bool = Field(..., description="是否成功")
    message: Optional[str] = Field(None, description="消息")
    data: Optional[Dict[str, Any]] = Field(None, description="数据")
    error: Optional[str] = Field(None, description="错误信息")


class ErrorResponse(BaseModel):
    """错误响应"""
    success: bool = Field(False, description="是否成功")
    error: str = Field(..., description="错误信息")
    detail: Optional[str] = Field(None, description="错误详情")
