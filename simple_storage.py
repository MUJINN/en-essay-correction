#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
简化存储方案 - 使用JSON文件替代数据库
无依赖，快速启动
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional
import uuid

# 存储目录
STORAGE_DIR = Path("data")
STORAGE_DIR.mkdir(exist_ok=True)

OCR_DATA_FILE = STORAGE_DIR / "ocr_data.json"
CORRECTION_DATA_FILE = STORAGE_DIR / "correction_data.json"
HISTORY_FILE = STORAGE_DIR / "history.json"


class SimpleStorage:
    """简单文件存储类"""

    @staticmethod
    def _read_json(file_path: Path) -> List[Dict]:
        """读取JSON文件"""
        if not file_path.exists():
            return []
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"⚠️ 读取文件失败 {file_path}: {e}")
            return []

    @staticmethod
    def _write_json(file_path: Path, data: List[Dict]) -> bool:
        """写入JSON文件"""
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"❌ 写入文件失败 {file_path}: {e}")
            return False

    # ========== OCR数据存储 ==========

    @classmethod
    def save_ocr_data(cls, image_id: str, boxes_data: List[Dict], full_text: str) -> str:
        """保存OCR数据"""
        ocr_data = {
            "id": str(uuid.uuid4()),
            "image_id": image_id,
            "boxes_data": boxes_data,
            "full_text": full_text,
            "created_at": datetime.now().isoformat()
        }

        data = cls._read_json(OCR_DATA_FILE)
        data.append(ocr_data)
        cls._write_json(OCR_DATA_FILE, data)
        print(f"✅ OCR数据已保存: {ocr_data['id']}")
        return ocr_data['id']

    @classmethod
    def get_ocr_data(cls, ocr_id: str) -> Optional[Dict]:
        """获取OCR数据"""
        data = cls._read_json(OCR_DATA_FILE)
        for item in data:
            if item['id'] == ocr_id:
                return item
        return None

    @classmethod
    def get_ocr_data_by_image_id(cls, image_id: str) -> Optional[Dict]:
        """根据图片ID获取OCR数据"""
        data = cls._read_json(OCR_DATA_FILE)
        for item in data:
            if item['image_id'] == image_id:
                return item
        return None

    # ========== 批改结果存储 ==========

    @classmethod
    def save_correction_result(
        cls,
        workflow_run_id: str,
        task_key: str,
        score: float,
        outputs: Dict[str, Any],
        intelligent_annotation: Dict[str, Any],
        ocr_annotation_match: List[Dict],
        elapsed_time: float,
        total_tokens: int
    ) -> str:
        """保存批改结果"""
        correction_data = {
            "id": str(uuid.uuid4()),
            "workflow_run_id": workflow_run_id,
            "task_key": task_key,
            "score": score,
            "outputs": outputs,
            "intelligent_annotation": intelligent_annotation,
            "ocr_annotation_match": ocr_annotation_match,
            "elapsed_time": elapsed_time,
            "total_tokens": total_tokens,
            "created_at": datetime.now().isoformat()
        }

        data = cls._read_json(CORRECTION_DATA_FILE)
        data.append(correction_data)
        cls._write_json(CORRECTION_DATA_FILE, data)
        print(f"✅ 批改结果已保存: {correction_data['id']}")
        return correction_data['id']

    @classmethod
    def get_correction_result(cls, correction_id: str) -> Optional[Dict]:
        """获取批改结果"""
        data = cls._read_json(CORRECTION_DATA_FILE)
        for item in data:
            if item['id'] == correction_id:
                return item
        return None

    # ========== 历史记录 ==========

    @classmethod
    def save_history_record(
        cls,
        task_key: str,
        grade: str,
        subject_chs: str,
        question_content: str,
        total_score: str,
        student_answer: str,
        breakdown_type: str,
        ocr_data_id: Optional[str],
        correction_result_id: Optional[str]
    ) -> str:
        """保存历史记录"""
        history_record = {
            "id": str(uuid.uuid4()),
            "task_key": task_key,
            "grade": grade,
            "subject_chs": subject_chs,
            "question_content": question_content,
            "total_score": total_score,
            "student_answer": student_answer,
            "breakdown_type": breakdown_type,
            "ocr_data_id": ocr_data_id,
            "correction_result_id": correction_result_id,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }

        data = cls._read_json(HISTORY_FILE)
        data.append(history_record)
        cls._write_json(HISTORY_FILE, data)
        print(f"✅ 历史记录已保存: {history_record['id']}")
        return history_record['id']

    @classmethod
    def get_history_list(cls, page: int = 1, size: int = 20) -> Dict[str, Any]:
        """获取历史记录列表（分页）"""
        data = cls._read_json(HISTORY_FILE)
        # 按创建时间倒序
        data.sort(key=lambda x: x['created_at'], reverse=True)

        total = len(data)
        start = (page - 1) * size
        end = start + size
        records = data[start:end]

        return {
            "total": total,
            "page": page,
            "size": size,
            "records": records
        }

    @classmethod
    def get_history_detail(cls, record_id: str) -> Optional[Dict]:
        """获取历史记录详情"""
        data = cls._read_json(HISTORY_FILE)
        for item in data:
            if item['id'] == record_id:
                return item
        return None

    @classmethod
    def get_history_with_details(cls, record_id: str) -> Optional[Dict]:
        """获取历史记录详情（包含OCR和批改结果）"""
        record = cls.get_history_detail(record_id)
        if not record:
            return None

        # 获取OCR数据
        ocr_data = None
        if record.get('ocr_data_id'):
            ocr_data = cls.get_ocr_data(record['ocr_data_id'])

        # 获取批改结果
        correction_result = None
        if record.get('correction_result_id'):
            correction_result = cls.get_correction_result(record['correction_result_id'])

        return {
            "record": record,
            "ocr_data": ocr_data,
            "correction_result": correction_result
        }

    # ========== 工具方法 ==========

    @classmethod
    def get_storage_info(cls) -> Dict[str, Any]:
        """获取存储信息"""
        info = {
            "storage_dir": str(STORAGE_DIR),
            "files": {}
        }

        for file_path in [OCR_DATA_FILE, CORRECTION_DATA_FILE, HISTORY_FILE]:
            if file_path.exists():
                info["files"][file_path.name] = {
                    "exists": True,
                    "size": file_path.stat().st_size,
                    "modified": datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(),
                    "records": len(cls._read_json(file_path))
                }
            else:
                info["files"][file_path.name] = {"exists": False}

        return info


# 便捷函数
def init_storage():
    """初始化存储"""
    print("🔧 初始化文件存储...")
    STORAGE_DIR.mkdir(exist_ok=True)
    print("✅ 文件存储初始化完成")


if __name__ == "__main__":
    # 测试
    init_storage()
    info = SimpleStorage.get_storage_info()
    print(json.dumps(info, ensure_ascii=False, indent=2))
