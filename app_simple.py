#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
简化版API服务 - 使用JSON文件存储
无需数据库依赖，快速启动
"""

import json
import uuid
import base64
import tempfile
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse

# 导入简化存储
from simple_storage import SimpleStorage, init_storage

# FastAPI应用
app = FastAPI(
    title="英语作文精批系统",
    description="简化版 - 使用文件存储",
    version="2.0.0"
)

# CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静态文件
app.mount("/static", StaticFiles(directory="static"), name="static")

# 配置
API_BASE_URL = "http://dify.iyunxiao.com"
WORKFLOW_ENDPOINT = f"{API_BASE_URL}/v1/workflows/run"


# ========== 工具函数 ==========

def get_api_key() -> str:
    """从配置文件读取API Key"""
    config_file = Path("一些配置和说明.txt")
    if config_file.exists():
        with open(config_file, "r", encoding="utf-8") as f:
            content = f.read()
            for line in content.split("\n"):
                if line.startswith("key:"):
                    return line.split("key:")[1].strip()
    raise HTTPException(status_code=400, detail="未配置API Key")


def save_uploaded_image(image: UploadFile, image_id: str) -> str:
    """保存上传的图片到临时文件"""
    temp_dir = Path("static/temp")
    temp_dir.mkdir(exist_ok=True)

    temp_path = temp_dir / f"{image_id}_{image.filename}"
    with open(temp_path, "wb") as buffer:
        content = image.file.read()
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


def call_workflow(inputs: Dict[str, Any], api_key: str) -> Dict[str, Any]:
    """调用工作流API"""
    # 开发模式：使用模拟数据
    if api_key == "test-key-for-debug":
        print("🔧 开发模式：返回模拟批改数据")
        return {
            "workflow_run_id": "debug-" + str(uuid.uuid4()),
            "data": {
                "outputs": {
                    "score": 14.5,
                    "overall_comment": "文章结构清晰，语言流畅。建议在词汇多样性和句式变化方面进一步提升。",
                    "breakdown": {
                        "内容": {"score": 4.5, "comment": "内容充实，观点明确。"},
                        "语言": {"score": 5.0, "comment": "语言表达准确，用词恰当。"},
                        "结构": {"score": 5.0, "comment": "结构清晰，逻辑性强。"}
                    },
                    "intelligent_annotation": {
                        "wonderful_expressions": [
                            {
                                "id": "wonderful_1",
                                "original_sentence": "I am writing to invite you to participate",
                                "improved_sentence": "I am writing to extend a warm invitation for you to participate",
                                "explanation": "使用更正式的邀请表达方式",
                                "type": "wonderful",
                                "highlight_color": "#4CAF50",
                                "text_index": 45
                            }
                        ],
                        "good_expressions": [
                            {
                                "id": "good_1",
                                "original_sentence": "The festival will feature various activities",
                                "improved_sentence": "The festival will showcase a diverse array of activities",
                                "explanation": "使用更生动的词汇",
                                "type": "good",
                                "highlight_color": "#2196F3",
                                "text_index": 80
                            }
                        ],
                        "improvements": [
                            {
                                "id": "improve_1",
                                "original_sentence": "I really hope you can join us",
                                "improved_sentence": "I genuinely hope you will be able to join us",
                                "explanation": "使用更正式的表达，避免缩略语",
                                "type": "improvement",
                                "highlight_color": "#FF5722",
                                "text_index": 150
                            }
                        ]
                    }
                },
                "elapsed_time": 3.2,
                "total_tokens": 1250
            }
        }

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
        response = requests.post(
            WORKFLOW_ENDPOINT,
            headers=headers,
            json=payload,
            timeout=120,
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        error_msg = str(e)
        if hasattr(e, "response") and e.response is not None:
            try:
                error_detail = e.response.json()
                error_msg = json.dumps(error_detail, ensure_ascii=False)
            except Exception:
                error_msg = e.response.text
        raise HTTPException(status_code=500, detail=f"API调用失败: {error_msg}")


# ========== OCR API ==========

@app.post("/api/v2/ocr")
async def ocr_recognize(image: UploadFile = File(...)):
    """
    OCR文字识别
    """
    # 1. 生成图片ID并保存
    image_id = str(uuid.uuid4())
    print(f"🖼️ 开始OCR识别，图片ID: {image_id}")

    try:
        temp_path = save_uploaded_image(image, image_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"保存图片失败: {str(e)}")

    try:
        # 2. 调用OCR服务
        print(f"🔍 调用OCR服务，文件路径: {temp_path}")

        # 读取图片并转换为Base64
        image_base64 = image_to_base64(temp_path)

        # 调用云校OCR服务
        ocr_url = "http://49.7.214.122:8001/ocr/batch"
        payload = [f"data:image/png;base64,{image_base64}"]

        headers = {"Content-Type": "application/json"}
        response = requests.post(ocr_url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        result = response.json()

        # 3. 处理OCR结果
        if isinstance(result, list) and len(result) > 0:
            result = result[0]  # 取第一个结果

        if "full_text" in result:
            full_text = result.get("full_text", "")
            boxes_data_raw = result.get("boxes_data", [])

            # 转换为标准格式
            boxes_data = []
            for i, box in enumerate(boxes_data_raw):
                boxes_data.append({
                    "text": box.get("text", ""),
                    "bbox": box.get("bbox", [0, 0, 0, 0]),
                    "confidence": box.get("confidence", 0.0),
                    "index": i
                })

            print(f"✅ OCR识别成功: {len(boxes_data)} 个文本块")

            # 4. 保存OCR数据
            ocr_id = SimpleStorage.save_ocr_data(image_id, boxes_data, full_text)

            # 5. 返回结果
            return {
                "success": True,
                "boxes_data": boxes_data,
                "full_text": full_text,
                "image_id": image_id,
                "ocr_id": ocr_id,
                "created_at": datetime.now().isoformat()
            }
        else:
            raise HTTPException(status_code=500, detail="OCR响应格式错误")

    except Exception as e:
        print(f"❌ OCR识别失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"OCR识别失败: {str(e)}")

    finally:
        # 6. 清理临时文件
        cleanup_temp_file(temp_path)


# ========== 主页路由 ==========

@app.get("/", response_class=HTMLResponse)
async def read_root():
    """主页"""
    try:
        with open("templates/index.html", "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return HTMLResponse(content="<h1>404 - 主页模板未找到</h1>", status_code=404)


# ========== 批改 API ==========

@app.post("/api/v2/correct")
async def correct_essay(request: Request):
    """
    作文批改
    """
    try:
        # 从请求中解析JSON数据
        data = await request.json()
        print(f"📝 开始批改作文，任务ID: {data.get('task_key', 'unknown')}")
    except Exception:
        raise HTTPException(status_code=400, detail="无效的JSON数据")

    try:
        # 1. 调用工作流API
        api_key = get_api_key()
        workflow_result = call_workflow(data, api_key)

        outputs = workflow_result.get("data", {}).get("outputs", {})
        print(f"✅ 工作流调用成功，获得批改结果")

        # 2. 智能标注匹配
        ocr_annotation_match = []
        if data.get("ocr_data"):
            print(f"🔗 开始OCR坐标和智能标注匹配...")

            ocr_boxes = data.get("ocr_data", {}).get("boxes_data", [])
            annotations = outputs.get("intelligent_annotation", {})

            if ocr_boxes and annotations:
                ocr_annotation_match = simple_match_annotations(ocr_boxes, annotations)
                print(f"✅ 匹配完成: {len(ocr_annotation_match)} 个标注匹配成功")
            else:
                print(f"⚠️ 缺少OCR数据或智能标注，跳过匹配")

        # 3. 保存到存储
        correction_id = SimpleStorage.save_correction_result(
            workflow_run_id=workflow_result.get("workflow_run_id", ""),
            task_key=data.get("task_key", "web-demo-task"),
            score=outputs.get("score", 0),
            outputs=outputs,
            intelligent_annotation=outputs.get("intelligent_annotation", {}),
            ocr_annotation_match=ocr_annotation_match,
            elapsed_time=workflow_result.get("data", {}).get("elapsed_time", 0),
            total_tokens=workflow_result.get("data", {}).get("total_tokens", 0)
        )

        # 4. 保存历史记录
        history_id = SimpleStorage.save_history_record(
            task_key=data.get("task_key", "web-demo-task"),
            grade=data.get("grade", ""),
            subject_chs=data.get("subject_chs", "英语"),
            question_content=data.get("question_content", ""),
            total_score=data.get("total_score", "15"),
            student_answer=data.get("student_answer", ""),
            breakdown_type=data.get("breakdown_type", ""),
            ocr_data_id=data.get("ocr_data", {}).get("ocr_id") if data.get("ocr_data") else None,
            correction_result_id=correction_id
        )

        # 5. 返回数据
        response_data = {
            "workflow_run_id": workflow_result.get("workflow_run_id", ""),
            "outputs": outputs,
            "boxes_data": data.get("ocr_data", {}).get("boxes_data", []) if data.get("ocr_data") else [],
            "intelligent_annotation": outputs.get("intelligent_annotation"),
            "ocr_annotation_match": ocr_annotation_match,
            "elapsed_time": workflow_result.get("data", {}).get("elapsed_time", 0),
            "total_tokens": workflow_result.get("data", {}).get("total_tokens", 0),
            "history_id": history_id
        }

        print(f"✅ 批改完成")
        return {"success": True, "data": response_data}

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ 批改过程出错: {str(e)}")
        raise HTTPException(status_code=500, detail=f"批改失败: {str(e)}")


# ========== 历史记录 API ==========

@app.get("/api/v2/history/list")
async def list_history(
    page: int = 1,
    size: int = 20,
    grade: Optional[str] = None,
    search: Optional[str] = None
):
    """获取历史记录列表"""
    print(f"📜 获取历史记录列表: page={page}, size={size}")

    result = SimpleStorage.get_history_list(page, size)

    # 简化过滤
    records = result["records"]
    if grade:
        records = [r for r in records if r.get("grade") == grade]
        result["total"] = len(records)

    if search:
        records = [r for r in records if search.lower() in r.get("student_answer", "").lower() or
                   search.lower() in r.get("question_content", "").lower()]
        result["total"] = len(records)

    result["records"] = records
    print(f"✅ 获取到 {len(records)} 条记录，共 {result['total']} 条")

    return {"success": True, "data": result}


@app.get("/api/v2/history/{record_id}")
async def get_history_detail(record_id: str):
    """获取历史记录详情"""
    print(f"🔍 获取历史记录详情: {record_id}")

    result = SimpleStorage.get_history_with_details(record_id)
    if not result:
        raise HTTPException(status_code=404, detail="记录不存在")

    print(f"✅ 历史记录详情加载完成")
    return {"success": True, "data": result}


# ========== 示例数据 API ==========

@app.get("/api/load-example")
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


# ========== 存储信息 API ==========

@app.get("/api/v2/storage/info")
async def get_storage_info():
    """获取存储信息"""
    info = SimpleStorage.get_storage_info()
    return {"success": True, "data": info}


# ========== 前端兼容性 API ==========

@app.get("/api/history/list")
async def history_list_compat():
    """历史记录列表（前端兼容）"""
    result = SimpleStorage.get_history_list(page=1, size=100)
    return {"success": True, "data": result}


@app.delete("/api/history/clear")
async def history_clear_compat():
    """清空历史记录（前端兼容）"""
    return {"success": False, "message": "简化版不支持清空历史记录，请手动删除 data/history.json 文件"}


@app.get("/api/history/export-all")
async def history_export_compat():
    """导出所有历史记录（前端兼容）"""
    result = SimpleStorage.get_history_list(page=1, size=1000)
    return {"success": True, "data": result}


@app.get("/api/history/download/{filename}")
async def history_download_compat(filename: str):
    """下载历史记录文件（前端兼容）"""
    # 返回简化说明文档而不是实际文件
    content = "简化版说明：\n此版本使用JSON文件存储数据。\n请访问 /api/v2/storage/info 查看存储状态。"
    return StreamingResponse(
        iter([content.encode('utf-8')]),
        media_type="text/plain",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )


# ========== 启动 ==========

@app.on_event("startup")
async def startup_event():
    """应用启动时初始化"""
    print("🚀 启动简化版API...")
    init_storage()
    print("✅ API启动完成")


# ========== 智能标注匹配函数 ==========

def simple_match_annotations(ocr_boxes: List[Dict], annotations: Dict) -> List[Dict]:
    """
    简化版智能标注匹配算法

    Args:
        ocr_boxes: OCR文本块列表
        annotations: 智能标注数据

    Returns:
        匹配结果列表
    """
    matches = []

    # 处理三种类型的标注
    for ann_type in ["nice_sentence", "good_sentence", "improve_sentence"]:
        if ann_type not in annotations or not annotations[ann_type]:
            continue

        for annotation in annotations[ann_type]:
            # 简单的文本匹配：找最佳OCR块
            best_match = None
            best_similarity = 0.0

            for i, box in enumerate(ocr_boxes):
                # 计算文本相似度
                similarity = calculate_text_similarity(
                    annotation.get("text", ""),
                    box.get("text", "")
                )

                if similarity > best_similarity:
                    best_similarity = similarity
                    best_match = {
                        "type": ann_type,
                        "annotation": annotation,
                        "ocr_index": i,
                        "ocr_bbox": box.get("bbox", [0, 0, 0, 0]),
                        "similarity": similarity,
                        "matched_text": box.get("text", ""),
                        "is_multi_block": False,
                        "ocr_indexes": [i]
                    }

            # 如果相似度超过阈值，添加到匹配结果
            if best_match and best_similarity >= 0.3:
                matches.append(best_match)

    return matches


def calculate_text_similarity(text1: str, text2: str) -> float:
    """
    计算两个文本的相似度

    使用简单算法：
    1. 短文本直接比较
    2. 长文本使用编辑距离
    3. 返回0-1之间的相似度
    """
    if not text1 or not text2:
        return 0.0

    # 预处理
    text1_norm = text1.lower().strip()
    text2_norm = text2.lower().strip()

    # 如果完全相同，相似度为1
    if text1_norm == text2_norm:
        return 1.0

    # 如果一个是另一个的子串
    if text1_norm in text2_norm or text2_norm in text1_norm:
        return 0.9

    # 简单的词汇匹配
    words1 = set(text1_norm.split())
    words2 = set(text2_norm.split())

    if not words1 or not words2:
        return 0.0

    # 计算词汇重叠度
    intersection = len(words1.intersection(words2))
    union = len(words1.union(words2))

    if union == 0:
        return 0.0

    # 基础相似度
    jaccard_similarity = intersection / union

    # 考虑长度惩罚
    length_ratio = min(len(text1_norm), len(text2_norm)) / max(len(text1_norm), len(text2_norm))

    # 综合相似度
    final_similarity = jaccard_similarity * (0.7 + 0.3 * length_ratio)

    return final_similarity


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app_simple:app", host="10.10.2.40", port=8008, reload=True)
