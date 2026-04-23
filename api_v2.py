#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
重构后的API服务（方案1：后端主导架构）
"""

import json
import uuid
import base64
import tempfile
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
import httpx  # 异步HTTP客户端
from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc

# 导入自定义模块
from database import get_db, SessionLocal
from models import OCRDataModel, CorrectionResultModel, HistoryRecordModel
from schemas import (
    OCRResponse, OCRBox,
    CorrectionRequest, CorrectionResponse, CorrectionResult,
    IntelligentAnnotation, OCRAnnotationMatch,
    HistoryRecord, HistoryListResponse, HistoryDetailResponse
)
from annotation_matcher import AnnotationMatcher

# ==================== Dify OCR配置 ====================
DIFY_UPLOAD_URL = "http://dify.iyunxiao.com/v1/files/upload"
DIFY_OCR_URL = "http://dify.iyunxiao.com/v1/workflows/run"
DIFY_API_KEY = "Bearer app-KeaEypF5V97iNrmsry4kou7b"

# FastAPI应用
app_v2 = FastAPI(
    title="英语作文精批工作流 API v2.0",
    description="重构版 - 后端主导架构",
    version="2.0.0"
)

# CORS中间件
app_v2.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静态文件
from fastapi.staticfiles import StaticFiles
app_v2.mount("/static", StaticFiles(directory="static"), name="static")

# 配置
API_BASE_URL = "http://dify.iyunxiao.com"
WORKFLOW_ENDPOINT = f"{API_BASE_URL}/v1/workflows/run"


# ========== 工具函数 ==========

def json_serializer(obj):
    """自定义JSON序列化器，处理datetime对象"""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


def get_api_key() -> str:
    """从配置文件读取API Key"""
    config_file = Path("一些配置和说明.txt")
    print(f"🔍 查找配置文件: {config_file}")

    if config_file.exists():
        print(f"✅ 配置文件存在")
        with open(config_file, "r", encoding="utf-8") as f:
            content = f.read()
            lines = content.split("\n")
            print(f"📄 配置文件内容行数: {len(lines)}")

            for i, line in enumerate(lines, 1):
                if line.startswith("key:"):
                    key = line.split("key:")[1].strip()
                    print(f"✅ 在第{i}行找到API Key")
                    print(f"🔑 Key长度: {len(key)}")
                    return key

            print(f"❌ 未找到以'key:'开头的行")
            print(f"📝 文件前几行内容:")
            for i, line in enumerate(lines[:5], 1):
                print(f"   {i}: {line[:50]}...")

    else:
        print(f"❌ 配置文件不存在: {config_file}")

    print(f"❌ API Key获取失败")
    raise HTTPException(status_code=500, detail="未配置API Key或配置文件格式错误")


async def save_uploaded_image(image: UploadFile, image_id: str) -> str:
    """保存上传的图片到临时文件"""
    temp_dir = Path("static/temp")
    temp_dir.mkdir(exist_ok=True)

    temp_path = temp_dir / f"{image_id}_{image.filename}"
    content = await image.read()
    with open(temp_path, "wb") as buffer:
        buffer.write(content)

    return str(temp_path)


def cleanup_temp_file(file_path: str):
    """清理临时文件"""
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception as e:
        print(f"⚠️ 清理临时文件失败: {e}")


def image_to_base64(image_path: str) -> str:
    """将图片转换为Base64编码"""
    with open(image_path, "rb") as image_file:
        encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
        return encoded_string


# ==================== Dify OCR 辅助函数 ====================

def dify_upload_image(image_path: str) -> Optional[str]:
    """
    上传图片到Dify获取file_id
    """
    try:
        print(f"  📂 读取本地文件: {image_path}")
        with open(image_path, 'rb') as f:
            content = f.read()
        filename = Path(image_path).name

        print(f"  ⬆️ 上传到Dify...")
        headers = {"Authorization": DIFY_API_KEY}
        files = {'file': (filename, content, 'image/jpeg')}

        response = requests.post(DIFY_UPLOAD_URL, headers=headers, files=files, timeout=30)

        if response.status_code in [200, 201]:
            result = response.json()
            file_id = result["id"]
            print(f"  ✅ 上传成功，file_id: {file_id}")
            return file_id
        else:
            error_msg = f"上传失败: {response.status_code} - {response.text}"
            print(f"  ❌ {error_msg}")
            return None

    except Exception as e:
        print(f"  ❌ 上传异常: {str(e)}")
        return None


def dify_ocr_recognize(file_id: str) -> Optional[Dict]:
    """
    使用Dify进行OCR识别
    """
    try:
        print(f"  🔍 执行OCR识别...")
        headers = {"Authorization": DIFY_API_KEY, "Content-Type": "application/json"}

        ocr_data = {
            "inputs": {
                "essay_url": [
                    {
                        "transfer_method": "local_file",
                        "upload_file_id": file_id,
                        "type": "image"
                    }
                ]
            },
            "response_mode": "blocking",
            "user": f"ocr-{int(time.time())}"
        }

        start_time = time.time()
        ocr_response = requests.post(DIFY_OCR_URL, headers=headers, json=ocr_data, timeout=60)

        if ocr_response.status_code == 200:
            ocr_result = ocr_response.json()
            processing_time = time.time() - start_time

            print(f"  ✅ OCR识别完成，耗时: {processing_time:.2f}秒")

            # 提取文本响应
            text = ocr_result.get("data", {}).get("outputs", {}).get("text", "")

            # 解析OCR结果
            if isinstance(text, dict):
                result = text
            else:
                # 清理并解析JSON字符串
                response_text = str(text)
                if response_text.startswith("```json"):
                    response_text = response_text[7:]
                if response_text.endswith("```"):
                    response_text = response_text[:-3]
                result = json.loads(response_text.strip())

            # 确保result是字典格式
            if not isinstance(result, dict):
                print(f"  ❌ OCR响应格式错误")
                return None

            print(f"  ✅ 解析成功:")
            print(f"     文本长度: {len(result.get('full_text', ''))} 字符")
            print(f"     文本块数量: {len(result.get('boxes_data', []))}")

            return result
        else:
            error_msg = f"OCR失败: {ocr_response.status_code} - {ocr_response.text}"
            print(f"  ❌ {error_msg}")
            return None

    except Exception as e:
        print(f"  ❌ OCR异常: {str(e)}")
        import traceback
        traceback.print_exc()
        return None


def calculate_avg_confidence(boxes_data: List[OCRBox]) -> float:
    """计算平均置信度"""
    if not boxes_data:
        return 0.0

    total_confidence = sum(box.confidence for box in boxes_data)
    return total_confidence / len(boxes_data)


async def call_workflow(inputs: Dict[str, Any], api_key: str) -> Dict[str, Any]:
    """调用工作流API（异步版本）"""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "inputs": inputs,
        "response_mode": "blocking",
        "user": "web-demo-user",
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                WORKFLOW_ENDPOINT,
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        error_msg = str(e)
        try:
            error_detail = e.response.json()
            error_msg = json.dumps(error_detail, ensure_ascii=False)
        except Exception:
            error_msg = e.response.text
        raise HTTPException(status_code=500, detail=f"API调用失败: {error_msg}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"API请求异常: {str(e)}")


# ========== 主页路由 ==========

@app_v2.get("/", response_class=HTMLResponse)
async def read_root():
    """主页"""
    try:
        with open("templates/index.html", "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return HTMLResponse(content="<h1>404 - 主页模板未找到</h1>", status_code=404)


# ========== OCR API ==========

@app_v2.post("/api/v2/ocr", response_model=OCRResponse)
async def ocr_recognize(image: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    OCR文字识别

    上传图片，返回识别结果和坐标数据
    """
    # 1. 生成图片ID并保存
    image_id = str(uuid.uuid4())
    print(f"🖼️ 开始OCR识别，图片ID: {image_id}")

    try:
        temp_path = await save_uploaded_image(image, image_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"保存图片失败: {str(e)}")

    try:
        # 2. 调用OCR服务
        print(f"🔍 调用Dify OCR服务，文件路径: {temp_path}")

        # 步骤1: 上传图片到Dify
        file_id = dify_upload_image(temp_path)
        if not file_id:
            raise HTTPException(status_code=500, detail="Dify图片上传失败")

        # 步骤2: 执行OCR识别
        result = dify_ocr_recognize(file_id)
        if not result:
            raise HTTPException(status_code=500, detail="Dify OCR识别失败")

        # 3. 处理OCR结果
        if isinstance(result, list) and len(result) > 0:
            result = result[0]  # 取第一个结果
        elif not isinstance(result, dict):
            raise HTTPException(status_code=500, detail="OCR响应格式错误：既不是列表也不是字典")

        if "full_text" in result:
            full_text = result.get("full_text", "")
            boxes_data_raw = result.get("boxes_data", [])

            # 转换为OCRBox对象列表
            boxes_data = []
            for i, box in enumerate(boxes_data_raw):
                # 处理OCR返回的坐标格式
                bbox = None
                if "bbox" in box:
                    # 边界框格式 [x, y, w, h]
                    bbox = box.get("bbox", [0, 0, 0, 0])
                elif "box" in box:
                    # 四边形顶点格式 [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
                    vertices = box.get("box", [])
                    if isinstance(vertices, list) and len(vertices) == 4:
                        # 转换为边界框
                        x_coords = [v[0] for v in vertices if isinstance(v, list) and len(v) >= 2]
                        y_coords = [v[1] for v in vertices if isinstance(v, list) and len(v) >= 2]
                        if x_coords and y_coords:
                            min_x, max_x = min(x_coords), max(x_coords)
                            min_y, max_y = min(y_coords), max(y_coords)
                            bbox = [min_x, min_y, max_x - min_x, max_y - min_y]

                if bbox is None:
                    bbox = [0, 0, 0, 0]

                boxes_data.append(OCRBox(
                    text=box.get("text", ""),
                    bbox=bbox,
                    confidence=box.get("confidence", 0.0),
                    index=i
                ))

            print(f"✅ OCR识别成功: {len(boxes_data)} 个文本块")

            # 4. 保存OCR数据到数据库
            ocr_model = OCRDataModel(
                id=str(uuid.uuid4()),
                image_id=image_id,
                boxes_json=json.dumps([box.dict() for box in boxes_data], ensure_ascii=False),
                full_text=full_text,
                confidence_avg=calculate_avg_confidence(boxes_data),
                created_at=datetime.now()
            )
            db.add(ocr_model)
            db.commit()

            # 5. 返回结果
            return OCRResponse(
                success=True,
                boxes_data=boxes_data,
                full_text=full_text,
                image_id=image_id,
                created_at=datetime.now()
            )
        else:
            raise HTTPException(status_code=500, detail="OCR响应格式错误")

    except Exception as e:
        db.rollback()
        print(f"❌ OCR识别失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"OCR识别失败: {str(e)}")

    finally:
        # 6. 清理临时文件
        cleanup_temp_file(temp_path)


# ========== 批改 API（核心） ==========

@app_v2.post("/api/v2/correct", response_model=CorrectionResponse)
async def correct_essay(request: CorrectionRequest, db: Session = Depends(get_db)):
    """
    作文批改（后端主导架构）

    1. 接收OCR数据和批改请求
    2. 调用工作流API
    3. 在后端匹配OCR坐标和智能标注
    4. 保存完整数据到数据库
    5. 返回包含OCR坐标的完整结果
    """
    print(f"📝 开始批改作文，任务ID: {request.task_key}")

    try:
        # 0. 从CorrectionRequest对象中提取图片数据
        image_data = request.image_data
        if image_data:
            print(f"📷 获取到图片数据，长度: {len(image_data)}")

        # 1. 构建传递给工作流的请求数据
        print(f"\n{'='*60}")
        print(f"📝 开始批改作文，任务ID: {request.task_key}")
        print(f"{'='*60}")
        print(f"🔑 获取API Key...")
        api_key = get_api_key()
        print(f"✅ API Key获取成功，前缀: {api_key[:10]}..." if api_key else f"❌ API Key为空！")

        request_data = {
            "task_key": request.task_key,
            "grade": request.grade,
            "subject_chs": request.subject_chs,
            "question_content": request.question_content,
            "total_score": request.total_score,
            "student_answer": request.student_answer,
            "breakdown_type": request.breakdown_type,
            "ocr_data": request.ocr_data.dict() if request.ocr_data else None,
            "image_data": image_data,
            "image_id": request.image_id
        }

        # 先序列化为JSON字符串，再反序列化，确保所有datetime都被转换
        json_str = json.dumps(request_data, default=json_serializer, ensure_ascii=False)
        request_data = json.loads(json_str)

        print(f"📤 准备调用工作流API...")
        print(f"📊 请求数据keys: {list(request_data.keys())}")
        print(f"📏 请求数据大小: {len(json_str)} 字符")
        print(f"🔄 调用中...")

        try:
            workflow_result = await call_workflow(request_data, api_key)
            print(f"✅ 工作流调用成功")
        except Exception as e:
            print(f"\n❌{'='*58}")
            print(f"❌ 工作流API调用失败")
            print(f"❌ 错误类型: {type(e).__name__}")
            print(f"❌ 错误信息: {str(e)}")
            print(f"❌ 任务ID: {request.task_key}")
            print(f"❌ API Key前缀: {api_key[:10]}...")
            print(f"📝 请求数据前200字符: {json_str[:200]}...")
            print(f"❌{'='*58}")
            raise

        outputs = workflow_result.get("data", {}).get("outputs", {})
        print(f"✅ 工作流调用成功，获得批改结果")
        print(f"🔍 [调试] outputs 包含的键: {list(outputs.keys()) if outputs else 'None'}")
        print(f"🔍 [调试] intelligent_annotation 在 outputs 中: {'intelligent_annotation' in outputs if outputs else False}")
        if outputs and 'intelligent_annotation' in outputs:
            print(f"🔍 [调试] intelligent_annotation 数据: {outputs['intelligent_annotation']}")
        else:
            print(f"🔍 [调试] ❌ 没有找到 intelligent_annotation 字段！")

        # 2. 后端智能标注匹配（核心业务逻辑）
        ocr_annotation_match = []
        if request.ocr_data and outputs.get("intelligent_annotation"):
            print(f"🔗 开始匹配OCR坐标和智能标注...")

            ocr_annotation_match = AnnotationMatcher.match_ocr_with_annotations(
                ocr_boxes=[box.dict() for box in request.ocr_data.boxes_data],
                annotations=outputs["intelligent_annotation"]
            )

            print(f"✅ 匹配完成: {len(ocr_annotation_match)} 个标注匹配成功")

        # 3. 构建完整结果
        # 修复问题：如果intelligent_annotation是None，则使用默认值
        intelligent_annotation_data = outputs.get("intelligent_annotation")
        if intelligent_annotation_data is None:
            intelligent_annotation_data = {}
            
        correction_result = CorrectionResult(
            workflow_run_id=workflow_result.get("workflow_run_id", ""),
            score=outputs.get("score", 0),
            score_dimension=outputs.get("score_dimension", []),
            composition_basic_info=outputs.get("composition_basic_info", {}),
            composition_overall_evaluation=outputs.get("composition_overall_evaluation", {}),
            intelligent_annotation=IntelligentAnnotation(
                **intelligent_annotation_data
            ),
            ocr_annotation_match=[
                OCRAnnotationMatch(**match) for match in ocr_annotation_match
            ] if ocr_annotation_match else [],
            elapsed_time=workflow_result.get("data", {}).get("elapsed_time", 0),
            total_tokens=workflow_result.get("data", {}).get("total_tokens", 0)
        )

        # 4. 保存到数据库（事务）
        print(f"💾 保存数据到数据库...")
        try:
            # 查找或创建OCR数据记录
            ocr_data_id = None
            if request.ocr_data:
                # 通过image_id查找OCR数据
                ocr_record = db.query(OCRDataModel).filter(
                    OCRDataModel.image_id == request.ocr_data.image_id
                ).first()

                if ocr_record:
                    ocr_data_id = ocr_record.id
                else:
                    # 如果不存在，创建新的OCR记录
                    ocr_record = OCRDataModel(
                        id=str(uuid.uuid4()),
                        image_id=request.ocr_data.image_id,
                        boxes_json=json.dumps([box.dict() for box in request.ocr_data.boxes_data], ensure_ascii=False),
                        full_text=request.ocr_data.full_text,
                        confidence_avg=calculate_avg_confidence(request.ocr_data.boxes_data),
                        created_at=datetime.now()
                    )
                    db.add(ocr_record)
                    db.flush()  # 确保获取到生成的id
                    ocr_data_id = ocr_record.id

            # 保存批改结果
            correction_model = CorrectionResultModel(
                id=str(uuid.uuid4()),
                workflow_run_id=correction_result.workflow_run_id,
                task_key=request.task_key,
                score=correction_result.score,
                outputs_json=json.dumps(outputs, ensure_ascii=False),
                intelligent_annotation_json=json.dumps(
                    correction_result.intelligent_annotation.dict(),
                    ensure_ascii=False
                ),
                ocr_annotation_match_json=json.dumps(
                    [match.dict() for match in correction_result.ocr_annotation_match],
                    ensure_ascii=False
                ),
                elapsed_time=correction_result.elapsed_time,
                total_tokens=correction_result.total_tokens,
                created_at=datetime.now()
            )
            db.add(correction_model)

            # 保存历史记录
            history_record = HistoryRecordModel(
                id=str(uuid.uuid4()),
                task_key=request.task_key,
                grade=request.grade,
                subject_chs=request.subject_chs,
                question_content=request.question_content,
                total_score=request.total_score,
                student_answer=request.student_answer,
                breakdown_type=request.breakdown_type,
                ocr_data_id=ocr_data_id,
                correction_result_id=correction_model.id,
                created_at=datetime.now(),
                updated_at=datetime.now()
            )

            # 如果有图片数据，保存到记录中
            if image_data and hasattr(history_record, 'image_data'):
                history_record.image_data = image_data
                print(f"✅ 已保存图片数据到历史记录，长度: {len(image_data)}")

            db.add(history_record)

            db.commit()
            print(f"✅ 数据保存成功，记录ID: {history_record.id}")

            # 5. 返回成功响应
            return CorrectionResponse(
                success=True,
                data={
                    "outputs": outputs,
                    "result": correction_result.dict()
                }
            )

        except Exception as e:
            db.rollback()
            error_msg = str(e)
            error_type = type(e).__name__

            # 分类数据库错误
            print(f"\n❌{'='*58}")
            print(f"❌ 数据库操作失败")
            print(f"❌ 错误类型: {error_type}")
            print(f"❌ 错误信息: {error_msg}")
            print(f"❌ 任务ID: {request.task_key}")
            print(f"❌{'='*58}")

            raise HTTPException(status_code=500, detail=f"数据库操作失败: {error_msg}")

    except HTTPException:
        # 重新抛出已知的HTTP异常
        raise
    except Exception as e:
        db.rollback()
        error_msg = str(e)
        error_type = type(e).__name__

        # 分类未知错误
        print(f"\n❌{'='*58}")
        print(f"❌ 批改过程发生未知错误")
        print(f"❌ 错误类型: {error_type}")
        print(f"❌ 错误信息: {error_msg}")
        print(f"❌ 任务ID: {request.task_key}")

        # 尝试分类错误类型
        import traceback
        error_trace = traceback.format_exc()

        if "httpx" in error_type or "requests" in error_type or "HTTP" in error_type:
            print(f"🔍 错误分类: 🌐 网络/API错误")
        elif "sqlalchemy" in error_type.lower() or "database" in error_msg.lower() or "db" in error_msg.lower():
            print(f"🔍 错误分类: 🗄️ 数据库错误")
        elif "json" in error_msg.lower() or "serializ" in error_msg.lower():
            print(f"🔍 错误分类: 📄 JSON序列化错误")
        elif "ocr" in error_msg.lower():
            print(f"🔍 错误分类: 🖼️ OCR相关错误")
        elif "api" in error_msg.lower() or "key" in error_msg.lower():
            print(f"🔍 错误分类: 🔑 API配置错误")
        else:
            print(f"🔍 错误分类: ❓ 未知类型错误")
            print(f"📋 详细堆栈信息:")
            print(error_trace)

        print(f"❌{'='*58}\n")

        raise HTTPException(status_code=500, detail=f"批改失败: {error_msg}")


# ========== 历史记录 API ==========

def record_to_dict(record: HistoryRecordModel, db: Session = None) -> Dict[str, Any]:
    """将数据库记录转换为字典"""
    result = {
        "id": record.id,
        "timestamp": record.created_at.isoformat(),
        "task_key": record.task_key,
        "grade": record.grade,
        "subject_chs": record.subject_chs,
        "question_content": record.question_content,
        "total_score": record.total_score,
        "student_answer": record.student_answer,
        "breakdown_type": record.breakdown_type,
        "updated_at": record.updated_at.isoformat() if record.updated_at else None,
        "is_deleted": record.is_deleted,
        # 图片数据（Base64编码）
        "image_data": record.image_data
    }

    # ✅ 如果提供了db，加载关联数据
    if db:
        # 加载OCR数据
        if record.ocr_data_id:
            ocr_data = db.query(OCRDataModel).filter(
                OCRDataModel.id == record.ocr_data_id
            ).first()
            if ocr_data:
                result["ocr_data"] = {
                    "boxes_data": json.loads(ocr_data.boxes_json),
                    "full_text": ocr_data.full_text,
                    "image_data": record.image_data  # 图片数据在历史记录中
                }

        # 加载批改结果
        if record.correction_result_id:
            correction_result = db.query(CorrectionResultModel).filter(
                CorrectionResultModel.id == record.correction_result_id
            ).first()
            if correction_result:
                result["outputs"] = json.loads(correction_result.outputs_json)
                # ✅ 如果有OCR数据,也添加到outputs中以保持兼容性
                if record.ocr_data_id and "ocr_data" in result:
                    result["outputs"]["boxes_data"] = result["ocr_data"]["boxes_data"]
                result["workflow_run_id"] = correction_result.workflow_run_id
                result["elapsed_time"] = correction_result.elapsed_time
                result["total_tokens"] = correction_result.total_tokens
                # 智能标注
                if correction_result.intelligent_annotation_json:
                    result["intelligent_annotation"] = json.loads(correction_result.intelligent_annotation_json)

    return result

@app_v2.get("/api/v2/history/list", response_model=HistoryListResponse)
async def list_history(
    page: int = 1,
    size: int = 20,
    grade: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """获取历史记录列表（分页）"""
    print(f"📜 获取历史记录列表: page={page}, size={size}")

    query = db.query(HistoryRecordModel).filter(
        HistoryRecordModel.is_deleted == False
    )

    if grade:
        query = query.filter(HistoryRecordModel.grade == grade)

    if search:
        query = query.filter(
            or_(
                HistoryRecordModel.question_content.contains(search),
                HistoryRecordModel.student_answer.contains(search)
            )
        )

    total = query.count()
    records = query.order_by(
        desc(HistoryRecordModel.created_at)
    ).offset((page - 1) * size).limit(size).all()

    print(f"✅ 获取到 {len(records)} 条记录，共 {total} 条")

    return HistoryListResponse(
        success=True,
        data={
            "total": total,
            "page": page,
            "size": size,
            "records": [record_to_dict(r, db) for r in records]  # ✅ 传递db参数，加载关联数据
        }
    )


@app_v2.get("/api/v2/history/{record_id}", response_model=HistoryDetailResponse)
async def get_history_detail(record_id: str, db: Session = Depends(get_db)):
    """获取历史记录详情（包含完整OCR数据）"""
    print(f"🔍 获取历史记录详情: {record_id}")

    record = db.query(HistoryRecordModel).filter(
        HistoryRecordModel.id == record_id,
        HistoryRecordModel.is_deleted == False
    ).first()

    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")

    # 加载关联数据
    ocr_data = db.query(OCRDataModel).filter(
        OCRDataModel.id == record.ocr_data_id
    ).first() if record.ocr_data_id else None

    correction_result = db.query(CorrectionResultModel).filter(
        CorrectionResultModel.id == record.correction_result_id
    ).first()

    # 转换OCR数据
    ocr_response = None
    if ocr_data:
        boxes_data = json.loads(ocr_data.boxes_json)
        ocr_response = OCRResponse(
            success=True,
            boxes_data=[OCRBox(**box) for box in boxes_data],
            full_text=ocr_data.full_text,
            image_id=ocr_data.image_id,
            created_at=ocr_data.created_at
        )

    # 转换批改结果
    correction_data = None
    if correction_result:
        outputs = json.loads(correction_result.outputs_json)
        intelligent_annotation = json.loads(correction_result.intelligent_annotation_json) if correction_result.intelligent_annotation_json else {}
        ocr_annotation_match = json.loads(correction_result.ocr_annotation_match_json) if correction_result.ocr_annotation_match_json else []

        correction_data = CorrectionResult(
            workflow_run_id=correction_result.workflow_run_id,
            score=correction_result.score,
            score_dimension=outputs.get("score_dimension", []),
            composition_basic_info=outputs.get("composition_basic_info", {}),
            composition_overall_evaluation=outputs.get("composition_overall_evaluation", {}),
            intelligent_annotation=IntelligentAnnotation(**intelligent_annotation),
            ocr_annotation_match=[OCRAnnotationMatch(**match) for match in ocr_annotation_match],
            elapsed_time=correction_result.elapsed_time,
            total_tokens=correction_result.total_tokens
        )

    print(f"✅ 历史记录详情加载完成")

    return HistoryDetailResponse(
        success=True,
        data={
            "record": record_to_dict(record),
            "ocr_data": ocr_response.dict() if ocr_response else None,
            "correction_result": correction_data.dict() if correction_data else None
        }
    )


# ========== 前端兼容性 API ==========

@app_v2.get("/api/load-example")
async def load_example():
    """加载示例数据"""
    example = {
        "question_content": "假设你校将举办\"外语节\"（Foreign Language Festival），请给你的英国朋友Chris写封邮件，说明活动的安排情况，并邀请他参加。内容包括：\n1. 活动时间、地点及活动内容\n2. 参加方式\n3. 期待他的参与",
        "student_answer": "Dear Chris,\n\nI am writing to invite you to participate in the Foreign Language Festival which will be held in our school. The festival is scheduled to take place next Saturday from 9:00 AM to 5:00 PM in the school auditorium and main courtyard.\n\nThe festival will feature various activities including language exchange sessions, cultural performances, international food stalls, and a language competition. You will have the opportunity to showcase your English skills and learn about different languages spoken around the world.\n\nTo participate, please register at the school office before Friday evening. We have prepared comfortable accommodation and meals for international guests.\n\nI really hope you can join us and share this wonderful experience with us. Looking forward to your early reply.\n\nYours sincerely,\nLi Hua",
        "grade": "高中三年级",
        "total_score": "25",
        "subject_chs": "英语",
        "breakdown_type": "书面表达"
    }
    return {"success": True, "data": example}


@app_v2.get("/api/history/list")
async def history_list_compat(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """历史记录列表（前端兼容）- 支持分页"""
    result = list_history_sync(db, page=page, size=size)
    return result


@app_v2.get("/api/history/export-all")
async def history_export_compat(db: Session = Depends(get_db)):
    """导出所有历史记录（前端兼容）"""
    result = list_history_sync(db, page=1, size=1000)
    return result


def list_history_sync(db: Session, page: int, size: int):
    """同步版本的历史记录列表 - 支持真正的分页"""
    from sqlalchemy import or_

    # 构建基础查询
    base_query = db.query(HistoryRecordModel).filter(
        HistoryRecordModel.is_deleted == False
    )

    # 获取总数
    total = base_query.count()

    # 执行分页查询
    records = base_query.order_by(desc(HistoryRecordModel.created_at)).offset(
        (page - 1) * size
    ).limit(size).all()

    # 转换为前端期望的"文件"格式
    files = []
    for record in records:
        record_dict = record_to_dict(record, db)
        # 模拟文件格式
        files.append({
            "filename": f"{record.task_key}_{record.id[:8]}.json",
            "modified_time": record.created_at.isoformat(),
            "size": len(json.dumps(record_dict, ensure_ascii=False)),
            "record_id": record.id,  # 添加真实的记录ID用于后续操作
            "preview": {
                "grade": record.grade,
                "score": record_dict.get("score", "N/A"),
                "student_answer": record.student_answer[:100] + "..." if len(record.student_answer) > 100 else record.student_answer,
                "question_content": record.question_content[:50] + "..." if record.question_content and len(record.question_content) > 50 else record.question_content
            }
        })

    # 构建返回结果
    result = {
        "total": total,
        "page": page,
        "size": size,
        "files": files,  # 前端期望的字段名
        "records": [record_to_dict(record, db) for record in records]
    }

    return {"success": True, "data": result}


@app_v2.delete("/api/history/clear")
async def history_clear_compat():
    """清空历史记录（前端兼容）"""
    return {"success": False, "message": "数据库版不支持清空历史记录功能"}


@app_v2.get("/api/history/download/{filename}")
async def history_download_compat(filename: str, db: Session = Depends(get_db)):
    """下载历史记录文件（前端兼容）"""
    from fastapi.responses import JSONResponse

    try:
        # 从filename中提取record_id片段
        # filename格式: task_key_recordid8.json
        if not filename.endswith('.json'):
            raise HTTPException(status_code=400, detail="无效的文件名格式")

        # 去掉.json后缀，按_分割
        parts = filename[:-5].split('_')
        if len(parts) < 2:
            raise HTTPException(status_code=400, detail="无效的文件名格式")

        # 最后一部分是record_id的前8位
        record_id_prefix = parts[-1]

        # 查找匹配的记录（使用LIKE查询）
        record = db.query(HistoryRecordModel).filter(
            HistoryRecordModel.id.like(f"{record_id_prefix}%"),
            HistoryRecordModel.is_deleted == False
        ).first()

        if not record:
            raise HTTPException(status_code=404, detail="记录不存在")

        # 加载关联数据
        ocr_data = db.query(OCRDataModel).filter(
            OCRDataModel.id == record.ocr_data_id
        ).first() if record.ocr_data_id else None

        correction_result = db.query(CorrectionResultModel).filter(
            CorrectionResultModel.id == record.correction_result_id
        ).first()

        # 构建完整数据（扁平化结构以适配前端）
        result_data = {
            # 基本信息字段（从record提升到顶层）
            "id": record.id,
            "timestamp": record.created_at.isoformat(),
            "task_key": record.task_key,
            "grade": record.grade,
            "subject_chs": record.subject_chs,
            "question_content": record.question_content,
            "total_score": record.total_score,
            "student_answer": record.student_answer,
            "breakdown_type": record.breakdown_type,
            "updated_at": record.updated_at.isoformat() if record.updated_at else None,
            "is_deleted": record.is_deleted,
            # 图片数据（Base64编码）
            "image_data": record.image_data
        }

        # OCR数据
        if ocr_data:
            boxes_data = json.loads(ocr_data.boxes_json)
            result_data["ocr_data"] = {
                "success": True,
                "boxes_data": boxes_data,
                "full_text": ocr_data.full_text,
                "image_id": ocr_data.image_id,
                "created_at": ocr_data.created_at.isoformat()
            }

        # 批改结果（outputs字段提升到顶层以适配前端）
        if correction_result:
            outputs = json.loads(correction_result.outputs_json)
            intelligent_annotation = json.loads(correction_result.intelligent_annotation_json) if correction_result.intelligent_annotation_json else {}
            ocr_annotation_match = json.loads(correction_result.ocr_annotation_match_json) if correction_result.ocr_annotation_match_json else []

            result_data["outputs"] = outputs  # 前端期望的字段
            result_data["workflow_run_id"] = correction_result.workflow_run_id
            result_data["score"] = correction_result.score
            result_data["elapsed_time"] = correction_result.elapsed_time
            result_data["total_tokens"] = correction_result.total_tokens
            result_data["intelligent_annotation"] = intelligent_annotation
            result_data["ocr_annotation_match"] = ocr_annotation_match

        return JSONResponse(content=result_data)

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ 获取历史记录详情失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取失败: {str(e)}")


# ========== 数据库初始化 ==========

@app_v2.on_event("startup")
async def startup_event():
    """应用启动时初始化数据库"""
    print("🚀 启动API v2.0...")
    from database import init_database
    init_database()
    print("✅ API v2.0 启动完成")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app_v2, host="10.10.2.40", port=8008, reload=True)
