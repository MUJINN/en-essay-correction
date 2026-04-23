#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据库初始化脚本
用于创建数据库表和示例数据
"""

from database import init_database, engine
from models import Base, OCRDataModel, CorrectionResultModel, HistoryRecordModel
from sqlalchemy.orm import Session
from datetime import datetime
import json
import uuid


def init_db():
    """初始化数据库"""
    print("🔧 开始初始化数据库...")
    init_database()
    print("✅ 数据库初始化完成")


def create_sample_data():
    """创建示例数据"""
    print("\n📝 创建示例数据...")

    # 创建数据库会话
    db = Session(bind=engine)

    try:
        # 示例1：OCR数据
        ocr_data_1 = OCRDataModel(
            id=str(uuid.uuid4()),
            image_id="sample_image_1",
            boxes_json=json.dumps([
                {"text": "Hello world", "bbox": [100, 200, 150, 30], "confidence": 0.95, "index": 0},
                {"text": "This is a test", "bbox": [100, 250, 200, 30], "confidence": 0.90, "index": 1}
            ], ensure_ascii=False),
            full_text="Hello world. This is a test",
            confidence_avg=0.925,
            created_at=datetime.now()
        )
        db.add(ocr_data_1)

        # 示例2：批改结果数据
        correction_result_1 = CorrectionResultModel(
            id=str(uuid.uuid4()),
            workflow_run_id="sample_workflow_1",
            task_key="sample_task",
            score=12.5,
            outputs_json=json.dumps({
                "score": 12.5,
                "score_dimension": [
                    {"dimension": "内容", "score": 4.0},
                    {"dimension": "语言", "score": 4.0},
                    {"dimension": "结构", "score": 4.5}
                ]
            }, ensure_ascii=False),
            intelligent_annotation_json=json.dumps({
                "nice_sentence": [
                    {"text": "Hello world", "nice_reason": "很好的开头"}
                ],
                "good_sentence": [
                    {"text": "This is a test", "good_reason": "表达清晰"}
                ],
                "improve_sentence": []
            }, ensure_ascii=False),
            ocr_annotation_match_json=json.dumps([
                {
                    "type": "nice_sentence",
                    "annotation": {"text": "Hello world", "nice_reason": "很好的开头"},
                    "ocr_index": 0,
                    "ocr_bbox": [100, 200, 150, 30],
                    "similarity": 0.95,
                    "matched_text": "Hello world",
                    "is_multi_block": False,
                    "ocr_indexes": [0]
                }
            ], ensure_ascii=False),
            elapsed_time=2.5,
            total_tokens=150,
            created_at=datetime.now()
        )
        db.add(correction_result_1)

        # 示例3：历史记录
        history_record_1 = HistoryRecordModel(
            id=str(uuid.uuid4()),
            task_key="sample_task",
            grade="高一",
            subject_chs="英语",
            question_content="Write a short essay about your favorite hobby",
            total_score="15",
            student_answer="Hello world. This is a test",
            breakdown_type="作文",
            ocr_data_id=ocr_data_1.id,
            correction_result_id=correction_result_1.id,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            is_deleted=False
        )
        db.add(history_record_1)

        # 提交事务
        db.commit()
        print("✅ 示例数据创建成功")

        # 查询并显示创建的数据
        print("\n📊 数据库中的数据：")
        records = db.query(HistoryRecordModel).all()
        print(f"历史记录数: {len(records)}")

        for record in records:
            print(f"  - 记录ID: {record.id}")
            print(f"    年级: {record.grade}")
            print(f"    科目: {record.subject_chs}")
            print(f"    创建时间: {record.created_at}")

    except Exception as e:
        db.rollback()
        print(f"❌ 创建示例数据失败: {e}")
        raise

    finally:
        db.close()


def show_database_info():
    """显示数据库信息"""
    print("\n📋 数据库信息:")
    print(f"  数据库URL: {engine.url}")

    # 显示表信息
    tables = Base.metadata.tables
    print(f"  表数量: {len(tables)}")
    for table_name, table in tables.items():
        print(f"    - {table_name}: {len(table.columns)} 列")


def main():
    """主函数"""
    print("=" * 60)
    print("🚀 数据库初始化工具")
    print("=" * 60)

    # 1. 初始化数据库
    init_db()

    # 2. 显示数据库信息
    show_database_info()

    # 3. 创建示例数据
    create_sample_data()

    print("\n" + "=" * 60)
    print("✅ 数据库初始化完成!")
    print("=" * 60)


if __name__ == "__main__":
    main()
