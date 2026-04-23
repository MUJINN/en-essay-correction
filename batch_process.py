#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量并行处理学生作文图片批改
支持10个并发处理

使用示例：
  # 限制处理10张图片，并发数为5
  python3 batch_process.py --max-items 10 --max-concurrent 5

  # 从第5张图片开始，处理10张
  python3 batch_process.py --start-from 4 --max-items 10

  # 从第10张图片开始，处理到最后
  python3 batch_process.py --start-from 9

  # 指定自定义数据目录
  python3 batch_process.py --data-dir /path/to/data --max-items 20
python3 batch_process.py --data-dir /home/wangdi5/en-essay-correction/data/12553138 --max-items 200 
"""

import os
import json
import asyncio
import aiohttp
import time
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime


def json_serializer(obj):
    """自定义JSON序列化器，处理datetime对象"""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


class BatchProcessor:
    """批量处理器"""

    def __init__(
        self,
        api_base_url: str = "http://127.0.0.1:8008",
        max_concurrent: int = 2,
        data_dir: str = "/home/wangdi5/en-essay-correction/data/125531381",
        max_items: Optional[int] = None,
        start_from: int = 0
    ):
        self.api_base_url = api_base_url
        self.max_concurrent = max_concurrent
        self.data_dir = Path(data_dir)
        self.max_items = max_items  # ✅ 限制最大处理数量
        self.start_from = start_from  # ✅ 从第几张图片开始（0表示从第一张开始）

        # 统计数据
        self.total = 0
        self.success = 0
        self.failed = 0
        self.results = []

        # 加载题目信息
        self.question_info = self._load_question_info()

    def _load_question_info(self) -> Dict[str, Any]:
        """加载题目信息"""
        question_file = self.data_dir / "question_content.json"
        with open(question_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        return {
            "question_content": data["question_content"],
            "grade": "高中三年级",
            "subject_chs": "英语",
            "total_score": "25",
            "breakdown_type": "书面表达",
            "type": 1
        }

    def get_image_files(self) -> List[Path]:
        """获取所有图片文件"""
        extensions = ['.png', '.jpg', '.jpeg']
        images = []
        for ext in extensions:
            images.extend(self.data_dir.glob(f"*{ext}"))

        # 排序，确保处理顺序一致
        images.sort()

        # ✅ 应用start_from和max_items参数进行切片
        total_images = len(images)
        start_index = self.start_from

        # 计算结束索引
        if self.max_items and self.max_items > 0:
            end_index = start_index + self.max_items
        else:
            end_index = None

        # 应用切片
        images = images[start_index:end_index]

        # 打印处理信息
        if self.start_from > 0 or (self.max_items and self.max_items > 0):
            msg = f"📌 图片处理范围: 从第 {start_index + 1} 张开始"
            if self.max_items:
                msg += f", 处理 {len(images)} 张 (最多 {self.max_items} 张)"
            else:
                msg += f", 共处理 {len(images)} 张"
            msg += f" / 总共 {total_images} 张"
            print(msg)

        return images

    def extract_student_id(self, filename: str) -> str:
        """从文件名提取学生考号
        例如: 12000_1531200198_0.png -> 1531200198
        """
        parts = filename.split('_')
        if len(parts) >= 2:
            return parts[1]
        return "unknown"

    async def ocr_recognize(
        self,
        session: aiohttp.ClientSession,
        image_path: Path
    ) -> Optional[Dict[str, Any]]:
        """OCR识别 - 使用Dify官方API两步法"""
        # 第一步：上传图片
        upload_url = "http://dify.iyunxiao.com/v1/files/upload"
        upload_headers = {"Authorization": "Bearer app-KeaEypF5V97iNrmsry4kou7b"}

        # 第二步：调用OCR工作流
        ocr_url = "http://dify.iyunxiao.com/v1/workflows/run"
        ocr_headers = {
            "Authorization": "Bearer app-KeaEypF5V97iNrmsry4kou7b",
            "Content-Type": "application/json"
        }

        max_retries = 3

        for attempt in range(max_retries):
            try:
                # 步骤1：上传图片
                print(f"  📤 上传图片: {image_path.name}")
                with open(image_path, 'rb') as f:
                    data = aiohttp.FormData()
                    data.add_field('file',
                                 f,
                                 filename=image_path.name,
                                 content_type='image/png')

                    async with session.post(upload_url, headers=upload_headers, data=data, timeout=30) as upload_resp:
                        if upload_resp.status in [200, 201]:
                            upload_result = await upload_resp.json()
                            file_id = upload_result["id"]
                            print(f"  ✅ 上传成功，file_id: {file_id}")
                        else:
                            error_text = await upload_resp.text()
                            print(f"  ❌ 图片上传失败 [{image_path.name}] (尝试 {attempt+1}/{max_retries}): {error_text}")
                            if attempt < max_retries - 1:
                                await asyncio.sleep(2)
                                continue
                            return None

                # 步骤2：调用OCR工作流
                print(f"  🔍 执行OCR识别...")
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
                    "user": f"batch-ocr-{int(time.time())}"
                }

                async with session.post(ocr_url, headers=ocr_headers, json=ocr_data, timeout=120) as ocr_resp:
                    if ocr_resp.status == 200:
                        ocr_result = await ocr_resp.json()

                        # 提取OCR结果
                        if ocr_result.get("data", {}).get("status") == "succeeded":
                            text_output = ocr_result["data"]["outputs"]["text"]

                            # 处理可能的JSON字符串格式
                            import json
                            if isinstance(text_output, str):
                                try:
                                    ocr_data = json.loads(text_output)
                                except:
                                    # 如果解析失败，包装成标准格式
                                    ocr_data = {
                                        "full_text": text_output,
                                        "boxes_data": [],
                                        "image_width": 0,
                                        "image_height": 0
                                    }
                            else:
                                ocr_data = text_output

                            # 返回OCR结果和file_id
                            return {
                                "full_text": ocr_data.get("full_text", ""),
                                "boxes_data": ocr_data.get("boxes_data", []),
                                "image_width": ocr_data.get("image_width", 0),
                                "image_height": ocr_data.get("image_height", 0),
                                "success": True,
                                "file_id": file_id  # 返回file_id供批改使用
                            }
                        else:
                            print(f"❌ OCR处理失败 [{image_path.name}]: {ocr_result}")
                            return None
                    else:
                        error_text = await ocr_resp.text()
                        print(f"❌ OCR失败 [{image_path.name}] (尝试 {attempt+1}/{max_retries}): {error_text}")
                        if attempt < max_retries - 1:
                            await asyncio.sleep(2)
                            continue
                        return None

            except Exception as e:
                import traceback
                error_msg = str(e) if str(e) else "未知错误"
                if attempt < max_retries - 1:
                    print(f"❌ OCR异常 [{image_path.name}] (尝试 {attempt+1}/{max_retries}): {error_msg}，2秒后重试...")
                    await asyncio.sleep(2)
                    continue
                else:
                    error_detail = traceback.format_exc()
                    print(f"❌ OCR异常 [{image_path.name}]: {error_msg}")
                    print(f"   详细信息: {error_detail}")
                    return None

        return None

    async def correct_essay(
        self,
        session: aiohttp.ClientSession,
        ocr_result: Dict[str, Any],
        student_id: str,
        image_path: Path
    ) -> Optional[Dict[str, Any]]:
        """批改作文"""
        url = f"{self.api_base_url}/api/v2/correct"

        try:
            # 读取图片并转换为Base64编码
            image_data = None
            try:
                with open(image_path, 'rb') as img_file:
                    import base64
                    image_data = base64.b64encode(img_file.read()).decode('utf-8')
                    print(f"✅ 已加载图片数据，长度: {len(image_data)}")
            except Exception as e:
                print(f"⚠️ 无法读取图片数据: {str(e)}")

            # 将请求数据转换为JSON字符串，处理datetime对象
            request_data = {
                "task_key": f"batch-{student_id}",
                "type": self.question_info["type"],  # 任务类型，number类型
                "grade": self.question_info["grade"],
                "subject_chs": self.question_info["subject_chs"],
                "question_content": self.question_info["question_content"],
                "total_score": self.question_info["total_score"],
                "student_answer": ocr_result.get("full_text", ""),
                "breakdown_type": self.question_info["breakdown_type"],
                "ocr_data": {
                    **ocr_result,  # 展开原有的ocr_result
                    "image_id": ocr_result.get("file_id", "")  # 添加image_id字段
                },
                "image_data": image_data  # 添加图片数据
            }

            # 先序列化为JSON字符串，再反序列化，确保所有datetime都被转换
            json_str = json.dumps(request_data, default=json_serializer, ensure_ascii=False)
            request_data = json.loads(json_str)

            async with session.post(url, json=request_data, timeout=180) as resp:
                if resp.status == 200:
                    result = await resp.json()

                    # 提取维度评分信息
                    if result.get("success") and result.get("data", {}).get("outputs"):
                        outputs = result["data"]["outputs"]
                        score_dimension = outputs.get("score_dimension", [])
                        if score_dimension:
                            print(f"  📊 维度评分: {len(score_dimension)} 个维度")
                            # 将维度评分添加到结果中
                            result["data"]["outputs"]["score_dimension"] = score_dimension

                    return result
                else:
                    error_text = await resp.text()
                    print(f"❌ 批改失败 [学生{student_id}]: {error_text}")
                    return None

        except Exception as e:
            import traceback
            error_msg = str(e) if str(e) else "未知错误"
            error_detail = traceback.format_exc()
            print(f"❌ 批改异常 [学生{student_id}]: {error_msg}")
            print(f"   详细信息: {error_detail}")
            return None

    async def process_one(
        self,
        session: aiohttp.ClientSession,
        image_path: Path,
        index: int
    ) -> Dict[str, Any]:
        """处理单个图片"""
        student_id = self.extract_student_id(image_path.name)

        print(f"[{index}/{self.total}] 开始处理: {image_path.name} (学生ID: {student_id})")

        start_time = time.time()
        result = {
            "image_name": image_path.name,
            "student_id": student_id,
            "success": False,
            "error": None,
            "score": None,
            "elapsed_time": 0
        }

        try:
            # 步骤1: OCR识别
            ocr_result = await self.ocr_recognize(session, image_path)
            if not ocr_result:
                result["error"] = "OCR识别失败"
                return result

            # 步骤2: 批改作文
            correction_result = await self.correct_essay(session, ocr_result, student_id, image_path)
            if not correction_result:
                result["error"] = "批改失败"
                return result

            # 提取分数
            if correction_result.get("success") and correction_result.get("data"):
                data = correction_result["data"]
                outputs = data.get("outputs", {})
                score = outputs.get("score", 0)
                score_dimension = outputs.get("score_dimension", [])

                result["success"] = True
                result["score"] = score
                result["score_dimension"] = score_dimension  # 保存维度评分
                result["elapsed_time"] = time.time() - start_time

                print(f"✅ [{index}/{self.total}] 完成: {image_path.name} - 得分: {score}")
            else:
                result["error"] = "结果解析失败"

        except Exception as e:
            result["error"] = str(e)
            print(f"❌ [{index}/{self.total}] 异常: {image_path.name} - {str(e)}")

        result["elapsed_time"] = time.time() - start_time
        return result

    async def process_batch(self, image_paths: List[Path]):
        """批量处理"""
        connector = aiohttp.TCPConnector(limit=self.max_concurrent)
        timeout = aiohttp.ClientTimeout(total=300)

        async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
            # 创建信号量控制并发数
            semaphore = asyncio.Semaphore(self.max_concurrent)

            async def process_with_semaphore(image_path: Path, index: int):
                async with semaphore:
                    return await self.process_one(session, image_path, index)

            # 并行处理所有图片
            tasks = [
                process_with_semaphore(img, i+1)
                for i, img in enumerate(image_paths)
            ]

            self.results = await asyncio.gather(*tasks)

    def save_results(self, output_file: str = "batch_results.json"):
        """保存处理结果"""
        output_path = self.data_dir / output_file

        summary = {
            "total": self.total,
            "success": self.success,
            "failed": self.failed,
            "success_rate": f"{self.success/self.total*100:.2f}%" if self.total > 0 else "0%",
            "processed_at": datetime.now().isoformat(),
            "results": self.results
        }

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)

        print(f"\n📊 结果已保存到: {output_path}")

    def print_summary(self):
        """打印统计摘要"""
        print("\n" + "="*60)
        print("批量处理完成统计")
        print("="*60)
        print(f"总数: {self.total}")
        print(f"成功: {self.success} ({self.success/self.total*100:.2f}%)" if self.total > 0 else "成功: 0")
        print(f"失败: {self.failed} ({self.failed/self.total*100:.2f}%)" if self.total > 0 else "失败: 0")

        # 统计分数分布
        if self.success > 0:
            scores = [r["score"] for r in self.results if r["success"] and r["score"] is not None]
            if scores:
                avg_score = sum(scores) / len(scores)
                max_score = max(scores)
                min_score = min(scores)
                print(f"\n分数统计:")
                print(f"  平均分: {avg_score:.2f}")
                print(f"  最高分: {max_score}")
                print(f"  最低分: {min_score}")

        # 显示失败的案例
        if self.failed > 0:
            print(f"\n失败案例:")
            failed_cases = [r for r in self.results if not r["success"]]
            for case in failed_cases[:10]:  # 最多显示10个
                print(f"  - {case['image_name']}: {case['error']}")
            if len(failed_cases) > 10:
                print(f"  ... 还有 {len(failed_cases)-10} 个失败案例")

        print("="*60)

    async def run(self):
        """运行批量处理"""
        print(f"🚀 开始批量处理...")
        print(f"📁 数据目录: {self.data_dir}")
        print(f"🔧 并发数: {self.max_concurrent}")
        print(f"📝 题目: {self.question_info['question_content'][:50]}...")
        print(f"⚡ API地址: {self.api_base_url}")
        print()

        # 获取图片列表
        image_paths = self.get_image_files()
        self.total = len(image_paths)

        if self.total == 0:
            print("❌ 未找到图片文件")
            return

        print(f"📷 找到 {self.total} 张图片")
        print(f"开始处理...\n")

        start_time = time.time()

        # 批量处理
        await self.process_batch(image_paths)

        # 统计结果
        self.success = sum(1 for r in self.results if r["success"])
        self.failed = self.total - self.success

        total_time = time.time() - start_time

        # 打印摘要
        self.print_summary()

        print(f"\n⏱️  总耗时: {total_time:.2f}秒")
        print(f"📊 平均处理时间: {total_time/self.total:.2f}秒/张" if self.total > 0 else "")

        # 保存结果
        self.save_results()


async def main():
    """主函数"""
    import argparse

    # ✅ 添加命令行参数支持
    parser = argparse.ArgumentParser(description='批量处理学生作文批改')
    parser.add_argument('--api-url', type=str, default='http://127.0.0.1:8008',
                        help='API服务器地址 (默认: http://127.0.0.1:8008)')
    parser.add_argument('--max-concurrent', type=int, default=10,
                        help='并发处理数量 (默认: 10)')
    parser.add_argument('--data-dir', type=str,
                        default='/home/wangdi5/en-essay-correction/data/125531381',
                        help='数据目录路径 (默认: /home/wangdi5/en-essay-correction/data/125531381)')
    parser.add_argument('--max-items', type=int,
                        help='限制最大处理数量 (默认: 不限制，处理所有图片)')
    parser.add_argument('--start-from', type=int, default=0,
                        help='从第几张图片开始处理，从0开始计数 (默认: 0，即从第一张开始)')
    args = parser.parse_args()

    print("="*60)
    print("🚀 批量批改系统")
    print("="*60)
    print(f"API地址: {args.api_url}")
    print(f"并发数: {args.max_concurrent}")
    print(f"数据目录: {args.data_dir}")
    if args.start_from > 0:
        print(f"开始位置: 从第 {args.start_from + 1} 张图片开始")
    if args.max_items:
        print(f"处理限制: 最多 {args.max_items} 张图片")
    else:
        print(f"处理限制: 不限制 (处理所有图片)")
    print("="*60)
    print()

    processor = BatchProcessor(
        api_base_url=args.api_url,
        max_concurrent=args.max_concurrent,
        data_dir=args.data_dir,
        max_items=args.max_items,  # ✅ 传入限制参数
        start_from=args.start_from  # ✅ 传入起始位置参数
    )

    await processor.run()


if __name__ == "__main__":
    asyncio.run(main())
