#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量处理学生答案图片脚本
用于处理指定目录中的所有学生答案图片，进行OCR识别和作文批改
结果将保存到数据库中
"""

import os
import json
import requests
import time
import argparse
from pathlib import Path
from typing import Dict, List, Any

# 默认配置
BASE_URL = "http://localhost:8008"
OCR_API = f"{BASE_URL}/api/v2/ocr"
CORRECT_API = f"{BASE_URL}/api/v2/correct"
HISTORY_LIST_API = f"{BASE_URL}/api/v2/history/list"
QUESTION_CONTENT_FILE = "/home/wangdi5/en-essay-correction/data/12553138/question_content.json"
IMAGES_DIR = "/home/wangdi5/en-essay-correction/data/12553138"
OUTPUT_FILE = "/home/wangdi5/en-essay-correction/data/12553138/batch_correction_results.json"


def load_question_content() -> str:
    """加载题目内容"""
    try:
        with open(QUESTION_CONTENT_FILE, 'r', encoding='utf-8') as f:
            content = f.read().strip()
            # 移除开头和结尾的引号
            if content.startswith('"question_content":'):
                content = content.split(':', 1)[1].strip().strip('"')
            return content
    except Exception as e:
        print(f"❌ 读取题目内容失败: {e}")
        return ""


def get_image_files(directory: str) -> List[Path]:
    """获取目录中所有的PNG图片文件"""
    image_dir = Path(directory)
    if not image_dir.exists():
        print(f"❌ 图片目录不存在: {directory}")
        return []
    
    # 获取所有PNG文件
    png_files = list(image_dir.glob("*.png"))
    print(f"📁 找到 {len(png_files)} 个PNG图片文件")
    return png_files


def ocr_recognize(image_path: Path) -> Dict[str, Any]:
    """OCR识别图片"""
    try:
        with open(image_path, 'rb') as f:
            files = {'image': (image_path.name, f, 'image/png')}
            response = requests.post(OCR_API, files=files)
            response.raise_for_status()
            result = response.json()
            
            if result.get("success"):
                print(f"✅ OCR识别成功: {image_path.name}")
                return result
            else:
                print(f"❌ OCR识别失败 {image_path.name}: {result.get('detail', '未知错误')}")
                return {}
    except Exception as e:
        print(f"❌ OCR请求异常 {image_path.name}: {e}")
        return {}


def correct_essay(student_answer: str, ocr_data: Dict, image_filename: str) -> Dict[str, Any]:
    """作文批改"""
    question_content = load_question_content()
    
    payload = {
        "task_key": f"batch_task_{image_filename}",
        "grade": "高一",
        "subject_chs": "英语",
        "question_content": question_content,
        "total_score": "25",
        "student_answer": student_answer,
        "breakdown_type": "书面表达",
        "ocr_data": ocr_data
    }
    
    try:
        response = requests.post(CORRECT_API, json=payload)
        response.raise_for_status()
        result = response.json()
        
        if result.get("success"):
            print(f"✅ 作文批改成功: {image_filename}")
            return result
        else:
            print(f"❌ 作文批改失败 {image_filename}: {result.get('detail', '未知错误')}")
            return {}
    except Exception as e:
        print(f"❌ 批改请求异常 {image_filename}: {e}")
        return {}


def process_single_image(image_path: Path) -> Dict[str, Any]:
    """处理单张图片"""
    print(f"\n📝 处理图片: {image_path.name}")
    
    # OCR识别
    ocr_result = ocr_recognize(image_path)
    if not ocr_result.get("success"):
        return {
            "image_filename": image_path.name,
            "success": False,
            "error": "OCR识别失败",
            "ocr_result": ocr_result
        }
    
    # 提取学生答案
    student_answer = ocr_result.get("full_text", "")
    if not student_answer:
        return {
            "image_filename": image_path.name,
            "success": False,
            "error": "OCR识别结果为空",
            "ocr_result": ocr_result
        }
    
    print(f"📄 识别到学生答案，长度: {len(student_answer)} 字符")
    
    # 作文批改
    correct_result = correct_essay(student_answer, ocr_result, image_path.name)
    
    return {
        "image_filename": image_path.name,
        "success": correct_result.get("success", False),
        "student_answer": student_answer,
        "ocr_result": ocr_result,
        "correct_result": correct_result,
        "processed_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }


def get_database_records() -> List[Dict]:
    """从数据库获取历史记录列表"""
    try:
        response = requests.get(HISTORY_LIST_API)
        response.raise_for_status()
        result = response.json()
        
        if result.get("success"):
            records = result.get("data", {}).get("records", [])
            print(f"📚 数据库中有 {len(records)} 条历史记录")
            return records
        else:
            print("❌ 获取数据库记录失败")
            return []
    except Exception as e:
        print(f"❌ 获取数据库记录异常: {e}")
        return []


def main():
    """主函数"""
    print("🚀 开始批量处理学生答案图片...")
    
    # 检查API服务是否可用
    try:
        response = requests.get(f"{BASE_URL}/docs")
        if response.status_code != 200:
            print("❌ API服务不可用，请确保已启动 api_v2.py 服务")
            return
    except Exception as e:
        print(f"❌ 无法连接到API服务: {e}")
        print("请先启动API服务:")
        print("  uvicorn api_v2:app_v2 --host 0.0.0.0 --port 8008")
        return
    
    # 加载题目内容
    question_content = load_question_content()
    if not question_content:
        print("❌ 无法加载题目内容")
        return
    
    print(f"📋 题目内容: {question_content[:100]}...")
    
    # 获取数据库现有记录
    existing_records = get_database_records()
    processed_files = {record.get("task_key").replace("batch_task_", "") for record in existing_records 
                      if record.get("task_key", "").startswith("batch_task_")}
    print(f"🔁 数据库中已有 {len(processed_files)} 个已处理文件")
    
    # 获取图片文件列表
    image_files = get_image_files(IMAGES_DIR)
    if not image_files:
        print("❌ 没有找到图片文件")
        return
    
    # 过滤掉已经处理过的文件
    remaining_files = [f for f in image_files if f.name not in processed_files]
    print(f"🆕 剩余待处理文件: {len(remaining_files)} 张图片")
    
    if not remaining_files:
        print("✅ 所有文件均已处理完成")
        return
    
    # 处理选项
    parser = argparse.ArgumentParser(description='批量处理学生答案图片')
    parser.add_argument('--limit', type=int, help='限制处理的图片数量')
    parser.add_argument('--start', type=int, default=0, help='开始处理的索引位置')
    args = parser.parse_args()
    
    # 限制处理数量
    if args.limit:
        remaining_files = remaining_files[args.start:args.start + args.limit]
        print(f"✂️ 限制处理数量: {len(remaining_files)} 张图片 (从第 {args.start} 张开始)")
    
    # 处理结果
    results = {
        "metadata": {
            "total_images": len(remaining_files),
            "processed_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "question_content": question_content
        },
        "students": []
    }
    
    # 依次处理每张图片
    successful_count = 0
    failed_count = 0
    
    for i, image_path in enumerate(remaining_files):
        print(f"\n🔄 进度: {i+1}/{len(remaining_files)} ({(i+1)/len(remaining_files)*100:.1f}%)")
        
        try:
            result = process_single_image(image_path)
            results["students"].append(result)
            
            if result["success"]:
                successful_count += 1
            else:
                failed_count += 1
                
            # 保存中间结果，防止程序意外退出丢失数据
            if (i + 1) % 10 == 0 or i == len(remaining_files) - 1:
                with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
                    json.dump(results, f, ensure_ascii=False, indent=2)
                print(f"💾 中间结果已保存到: {OUTPUT_FILE}")
                
        except Exception as e:
            print(f"❌ 处理图片时发生异常 {image_path.name}: {e}")
            failed_count += 1
            results["students"].append({
                "image_filename": image_path.name,
                "success": False,
                "error": f"处理异常: {str(e)}"
            })
        
        # 添加延迟，避免请求过于频繁
        time.sleep(1)
    
    # 保存最终结果
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    # 再次获取数据库记录以验证保存情况
    final_records = get_database_records()
    
    print(f"\n🎉 批量处理完成!")
    print(f"📊 总计: {len(remaining_files)} 张图片")
    print(f"✅ 成功: {successful_count} 张")
    print(f"❌ 失败: {failed_count} 张")
    print(f"📚 数据库记录总数: {len(final_records)} 条")
    print(f"💾 结果已保存到: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()