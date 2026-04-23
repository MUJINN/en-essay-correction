#!/usr/bin/env python3
"""
Dify OCR增强版 - 支持坐标测试和可视化
功能:
1. OCR识别并返回完整的坐标数据
2. 可视化显示识别边界框
3. 批量处理测试
4. 坐标精度评估

使用方法:
python3 /home/wangdi5/test/doubao1.6vision-essay/dify_ocr_enhanced.py --path "/home/wangdi5/test/doubao1.6vision-essay/12000_1531200001_0.png" --visualize
python dify_ocr_enhanced.py --batch-dir "/path/to/images" --output-dir results --visualize
"""

import requests
import json
import time
import argparse
import sys
import os
from datetime import datetime
from pathlib import Path
import base64
from typing import List, Dict, Optional, Tuple
import math

# 可视化依赖
try:
    from PIL import Image, ImageDraw, ImageFont
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("⚠️ 未安装PIL，无法进行可视化。请运行: pip install Pillow")

# ==================== 辅助功能函数 ====================
def check_dependencies():
    """检查依赖库"""
    print("\n" + "="*60)
    print("🔍 检查依赖")
    print("="*60)

    missing_deps = []

    try:
        import requests
        print("  ✅ requests")
    except ImportError:
        print("  ❌ requests (请运行: pip install requests)")
        missing_deps.append("requests")

    try:
        from PIL import Image, ImageDraw
        print("  ✅ PIL (Pillow)")
    except ImportError:
        print("  ❌ PIL (Pillow) (请运行: pip install Pillow)")
        missing_deps.append("pillow")

    if missing_deps:
        print(f"\n⚠️ 缺少依赖: {', '.join(missing_deps)}")
        print(f"请运行: pip install {' '.join(missing_deps)}")
        return False
    else:
        print("\n✅ 所有依赖已安装")
        return True

def analyze_image_structure(boxes_data):
    """分析图片结构（单张或拼接）"""
    if not boxes_data:
        print("  ❌ 没有文本块数据")
        return

    # 统计各区域的文本块数量
    region_count = {}
    for box in boxes_data:
        region = box.get("region", "unknown")
        region_count[region] = region_count.get(region, 0) + 1

    # 判断图片类型
    regions = list(region_count.keys())
    if len(regions) == 1 and regions[0] == "single":
        print("  📄 图片类型: 单张图片")
        print(f"  📊 文本块数量: {region_count['single']} 个")
    elif "top" in regions and "bottom" in regions:
        print("  📄 图片类型: 上下拼接")
        print(f"  📊 上半区域: {region_count.get('top', 0)} 个文本块")
        print(f"  📊 下半区域: {region_count.get('bottom', 0)} 个文本块")
        print(f"  📊 总计: {len(boxes_data)} 个文本块")
    elif "left" in regions and "right" in regions:
        print("  📄 图片类型: 左右拼接")
        print(f"  📊 左半区域: {region_count.get('left', 0)} 个文本块")
        print(f"  📊 右半区域: {region_count.get('right', 0)} 个文本块")
        print(f"  📊 总计: {len(boxes_data)} 个文本块")
    else:
        print(f"  📄 图片类型: 未知 (regions: {regions})")
        for region, count in region_count.items():
            print(f"  📊 {region}: {count} 个文本块")

def print_step_by_step_test():
    """打印逐步测试说明"""
    print("\n" + "="*60)
    print("🧪 逐步测试流程")
    print("="*60)
    print("\n测试步骤:")
    print("  1️⃣  检查依赖库")
    print("  2️⃣  读取图片")
    print("  3️⃣  上传到Dify")
    print("  4️⃣  执行OCR识别")
    print("  5️⃣  解析JSON结果")
    print("  6️⃣  分析图片结构")
    print("  7️⃣  生成可视化")
    print("="*60)

# ==================== 配置 ====================
DIFY_UPLOAD_URL = "http://dify.iyunxiao.com/v1/files/upload"
DIFY_OCR_URL = "http://dify.iyunxiao.com/v1/workflows/run"

# API密钥 - 记得替换为你的实际密钥
DIFY_UPLOAD_KEY = "Bearer app-KeaEypF5V97iNrmsry4kou7b"
DIFY_OCR_KEY = "Bearer app-KeaEypF5V97iNrmsry4kou7b"

# ==================== 数据结构 ====================
class OCRResult:
    """OCR识别结果"""
    def __init__(self):
        self.full_text: str = ""
        self.boxes_data: List[Dict] = []
        self.success: bool = False
        self.error: str = ""
        self.processing_time: float = 0.0
        self.file_id: str = ""
        self.image_width: int = 0   # OCR处理时的图片宽度
        self.image_height: int = 0  # OCR处理时的图片高度

    def to_dict(self) -> Dict:
        return {
            "full_text": self.full_text,
            "boxes_data": self.boxes_data,
            "success": self.success,
            "error": self.error,
            "processing_time": self.processing_time,
            "file_id": self.file_id,
            "image_width": self.image_width,
            "image_height": self.image_height
        }

    @classmethod
    def from_dict(cls, data: Dict) -> 'OCRResult':
        result = cls()
        result.full_text = data.get("full_text", "")
        result.boxes_data = data.get("boxes_data", [])
        result.success = data.get("success", False)
        result.error = data.get("error", "")
        result.processing_time = data.get("processing_time", 0.0)
        result.file_id = data.get("file_id", "")
        result.image_width = data.get("image_width", 0)   # 提取图片宽度
        result.image_height = data.get("image_height", 0)  # 提取图片高度
        return result

# ==================== 核心功能 ====================
def upload_image(image_url=None, image_path=None):
    """
    上传图片到Dify
    """
    try:
        if image_url:
            print(f"  📥 下载图片: {image_url[:80]}...")
            img_response = requests.get(image_url, timeout=30)
            if img_response.status_code != 200:
                return {"success": False, "error": f"图片下载失败: HTTP {img_response.status_code}"}

            content = img_response.content
            filename = 'temp.jpg'
        elif image_path:
            path = Path(image_path)
            if not path.exists():
                return {"success": False, "error": f"文件不存在: {image_path}"}

            print(f"  📂 读取本地文件: {image_path}")
            with open(path, 'rb') as f:
                content = f.read()
            filename = path.name
        else:
            return {"success": False, "error": "必须提供image_url或image_path"}

        print(f"  ⬆️ 上传到Dify...")
        headers = {"Authorization": DIFY_UPLOAD_KEY}
        files = {'file': (filename, content, 'image/jpeg')}

        response = requests.post(DIFY_UPLOAD_URL, headers=headers, files=files, timeout=30)

        if response.status_code in [200, 201]:
            result = response.json()
            file_id = result["id"]
            print(f"  ✅ 上传成功，file_id: {file_id}")
            return {"success": True, "file_id": file_id}
        else:
            error_msg = f"上传失败: {response.status_code} - {response.text}"
            print(f"  ❌ {error_msg}")
            return {"success": False, "error": error_msg}

    except Exception as e:
        return {"success": False, "error": f"上传异常: {str(e)}"}

def parse_ocr_response(response_data) -> OCRResult:
    """
    解析OCR返回的数据（可能是JSON字符串或Python字典）
    """
    result = OCRResult()

    # 尝试直接解析JSON
    try:
        # 如果已经是字典，直接使用
        if isinstance(response_data, dict):
            data = response_data
        else:
            # 如果是字符串，清理并解析JSON
            response_text = str(response_data)
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            data = json.loads(response_text.strip())

        # 提取字段
        result.full_text = data.get("full_text", "")
        result.boxes_data = data.get("boxes_data", [])
        result.image_width = data.get("image_width", 0)    # 提取图片宽度
        result.image_height = data.get("image_height", 0)  # 提取图片高度
        result.success = True

        # 打印图片尺寸信息（如果有）
        if result.image_width > 0 and result.image_height > 0:
            print(f"  📐 OCR返回图片尺寸: {result.image_width}x{result.image_height}")

        # 验证数据格式
        if not isinstance(result.boxes_data, list):
            result.boxes_data = []
            result.error = "boxes_data不是数组格式"
            result.success = False

        # 验证每个box的格式
        for i, box in enumerate(result.boxes_data):
            if not isinstance(box, dict):
                print(f"  ⚠️ 跳过无效的box {i}: {box}")
                continue

            # 确保必要字段存在
            if "text" not in box:
                box["text"] = ""
            if "bbox" not in box:
                box["bbox"] = [0, 0, 0, 0]
            if "confidence" not in box:
                box["confidence"] = 0.5

            # 验证bbox格式并检测坐标类型
            bbox = box["bbox"]
            try:
                if isinstance(bbox, list) and len(bbox) == 4:
                    # 转换为数值
                    numeric_bbox = [float(x) for x in bbox]
                    v1, v2, v3, v4 = numeric_bbox

                    # 🕵️ 智能检测坐标格式（每个box独立判断）
                    # 格式1: [x, y, width, height] - v3是宽度，v4是高度（通常较小，如30-100）
                    # 格式2: [x1, y1, x2, y2] - v3是右边界x坐标，v4是下边界y坐标

                    # 核心判断逻辑：
                    # 1. 如果 v3 < v1，肯定是 [x, y, w, h]（宽度不可能比x坐标小太多...但可以）
                    # 2. 如果 v4 < v2，肯定是 [x, y, w, h]（高度不可能比y坐标小）
                    # 3. 如果 v3 > v1 且 v4 > v2：
                    #    - 文本行高度通常在 30-80 像素之间
                    #    - 如果 v4 - v2 在这个范围内，且 v4 本身很大（>100），则是 [x1,y1,x2,y2]
                    #    - 如果 v4 本身很小（<100），则 v4 可能就是高度值，是 [x, y, w, h]

                    is_xywh_format = False  # 默认假设是 [x1, y1, x2, y2]

                    if v3 < v1:
                        # v3 < v1，说明v3是宽度（宽度比x坐标小）
                        is_xywh_format = True
                    elif v4 < v2:
                        # v4 < v2，说明v4是高度（高度比y坐标小）
                        is_xywh_format = True
                    elif v4 < 100:
                        # v4 很小（<100），更像是高度值而不是y2坐标
                        is_xywh_format = True
                    elif v3 < 200 and v1 > 50:
                        # v3 较小（<200）且 v1 较大，v3 更像是宽度
                        is_xywh_format = True
                    else:
                        # v3 > v1 且 v4 > v2 且都较大，检查差值是否合理
                        potential_height = v4 - v2
                        # 文本行高度通常在 20-100 像素
                        if 15 < potential_height < 150:
                            # 差值合理，是 [x1, y1, x2, y2] 格式
                            is_xywh_format = False
                        else:
                            # 差值不合理，可能是 [x, y, w, h]
                            is_xywh_format = True

                    if is_xywh_format:
                        # [x, y, width, height] 格式，直接使用
                        box["bbox"] = [int(v1), int(v2), int(v3), int(v4)]
                        if i == 0:
                            print(f"  📐 坐标格式: [x, y, width, height] (直接使用)")
                    else:
                        # [x1, y1, x2, y2] 格式，转换为 [x, y, width, height]
                        w = v3 - v1
                        h = v4 - v2
                        box["bbox"] = [int(v1), int(v2), int(w), int(h)]
                        if i == 0:
                            print(f"  📐 坐标格式: [x1, y1, x2, y2] -> 转换为 [x, y, w, h]")

                elif isinstance(bbox, tuple) and len(bbox) == 4:
                    box["bbox"] = [int(float(x)) for x in bbox]
                else:
                    print(f"  ⚠️ 文本块 {i} bbox格式无效: {type(bbox)} = {bbox}")
                    box["bbox"] = [0, 0, 0, 0]
            except Exception as e:
                print(f"  ❌ 处理文本块 {i} bbox时出错: {e}")
                print(f"     bbox类型: {type(bbox)}, 值: {bbox}")
                box["bbox"] = [0, 0, 0, 0]

            # 验证confidence
            try:
                box["confidence"] = float(box["confidence"])
                box["confidence"] = max(0.0, min(1.0, box["confidence"]))
            except (ValueError, TypeError):
                box["confidence"] = 0.5

        return result

    except json.JSONDecodeError as e:
        result.success = False
        result.error = f"JSON解析失败: {str(e)}"
        print(f"  ❌ JSON解析错误: {e}")
        print(f"  📄 原始文本: {response_text[:200]}...")
        return result
    except Exception as e:
        result.success = False
        result.error = f"解析异常: {str(e)}"
        print(f"  ❌ 详细错误信息:")
        import traceback
        traceback.print_exc()
        print(f"  📄 原始响应: {response_text[:500]}...")
        return result

def ocr_recognize(file_id: str) -> OCRResult:
    """
    使用Dify进行OCR识别
    """
    result = OCRResult()
    result.file_id = file_id

    try:
        print(f"  🔍 执行OCR识别...")
        headers = {"Authorization": DIFY_OCR_KEY, "Content-Type": "application/json"}

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
            "user": f"ocr-test-{int(time.time())}"
        }

        start_time = time.time()
        ocr_response = requests.post(DIFY_OCR_URL, headers=headers, json=ocr_data, timeout=60)

        if ocr_response.status_code == 200:
            ocr_result = ocr_response.json()
            result.processing_time = time.time() - start_time

            print(f"  ✅ OCR识别完成，耗时: {result.processing_time:.2f}秒")

            # 提取文本响应
            text = ocr_result.get("data", {}).get("outputs", {}).get("text", "")

            # 打印原始响应信息
            if isinstance(text, dict):
                print(f"  📄 原始响应类型: dict")
                print(f"  📄 响应键: {list(text.keys())}")
            elif isinstance(text, str):
                print(f"  📄 原始响应: {text[:500]}...")
            else:
                print(f"  📄 原始响应类型: {type(text)}")
                print(f"  📄 原始响应内容: {str(text)[:500]}...")

            # 解析OCR结果
            parsed_result = parse_ocr_response(text)
            result.full_text = parsed_result.full_text
            result.boxes_data = parsed_result.boxes_data
            result.success = parsed_result.success
            result.error = parsed_result.error
            result.image_width = parsed_result.image_width   # 复制图片宽度
            result.image_height = parsed_result.image_height  # 复制图片高度

            if result.success:
                print(f"  ✅ 解析成功:")
                print(f"     文本长度: {len(result.full_text)} 字符")
                print(f"     文本块数量: {len(result.boxes_data)}")

                # 🔍 调试：输出第一个bbox的详细信息
                if len(result.boxes_data) > 0:
                    first_bbox = result.boxes_data[0].get("bbox", [])
                    print(f"  🔍 第一个bbox原始值: {first_bbox}")
                    if len(first_bbox) == 4:
                        print(f"      值1: {first_bbox[0]} (可能是x1或x)")
                        print(f"      值2: {first_bbox[1]} (可能是y1或y)")
                        print(f"      值3: {first_bbox[2]} (可能是x2或width)")
                        print(f"      值4: {first_bbox[3]} (可能是y2或height)")
                        print(f"      如果值3和值4 > 3000，则是width/height格式")
                        print(f"      如果值3 > 值1且值4 > 值1，则是x1,y1,x2,y2格式")

                # 显示每个文本块的信息
                for i, box in enumerate(result.boxes_data[:5]):  # 只显示前5个
                    try:
                        bbox = box.get("bbox", [0, 0, 0, 0])
                        x, y, w, h = bbox
                        confidence = box.get("confidence", 0)
                        text_content = box.get("text", "")[:30]
                        print(f"     [{i}] {text_content}... (bbox: [{x},{y},{w},{h}], conf: {confidence:.2f})")
                        if i == 0:  # 第一个框显示详细计算过程
                            print(f"        详细: x={x}, y={y}, w={w}, h={h}")
                            print(f"        计算: width={w}={x}+{w}? 验证x+w应该=右下x坐标")
                    except Exception as e:
                        print(f"     [{i}] ❌ 处理文本块时出错: {e}")
                        print(f"        box内容: {box}")
                        print(f"        bbox: {box.get('bbox')}")
                        import traceback
                        traceback.print_exc()

                if len(result.boxes_data) > 5:
                    print(f"     ... 还有 {len(result.boxes_data) - 5} 个文本块")
            else:
                print(f"  ❌ 解析失败: {result.error}")

            return result
        else:
            error_msg = f"OCR失败: {ocr_response.status_code} - {ocr_response.text}"
            print(f"  ❌ {error_msg}")
            result.success = False
            result.error = error_msg
            return result

    except requests.exceptions.ConnectionError as e:
        error_msg = f"连接错误: {str(e)}"
        print(f"  ❌ {error_msg}")
        result.success = False
        result.error = error_msg
        return result
    except Exception as e:
        error_msg = f"OCR异常: {str(e)}"
        print(f"  ❌ {error_msg}")
        print(f"  详细错误信息:")
        import traceback
        traceback.print_exc()
        result.success = False
        result.error = error_msg
        return result

# ==================== 可视化功能 ====================
def visualize_ocr_result(image_path: str, ocr_result: OCRResult, output_path: str = None, show_confidence: bool = True):
    """
    在图片上绘制OCR识别结果的可视化

    Args:
        image_path: 原始图片路径
        ocr_result: OCR识别结果
        output_path: 输出图片路径（可选）
        show_confidence: 是否显示置信度
    """
    if not HAS_PIL:
        print("❌ 无法可视化：未安装PIL库")
        return None

    try:
        # 打开图片并确保是RGB模式
        img = Image.open(image_path)
        if img.mode != 'RGB':
            img = img.convert('RGB')

        draw = ImageDraw.Draw(img)

        print(f"  🎨 开始绘制可视化...")
        print(f"  📐 图片尺寸: {img.size}")
        print(f"  🎨 图片模式: {img.mode}")

        # 计算坐标缩放比例（OCR坐标可能基于不同尺寸的图片）
        max_x = 0
        max_y = 0
        for box in ocr_result.boxes_data:
            bx, by, bw, bh = box.get("bbox", [0, 0, 0, 0])
            max_x = max(max_x, bx + bw)
            max_y = max(max_y, by + bh)

        # 智能计算缩放比例
        scale_x = 1.0
        scale_y = 1.0

        # 优先从OCR结果中获取处理图片的实际尺寸
        ocr_width = ocr_result.image_width if ocr_result.image_width > 0 else None
        ocr_height = ocr_result.image_height if ocr_result.image_height > 0 else None

        if ocr_width and ocr_height and ocr_width > 0 and ocr_height > 0:
            # 使用OCR返回的精确尺寸计算缩放
            scale_x = img.width / ocr_width
            scale_y = img.height / ocr_height
            print(f"  ✅ 使用OCR返回的图片尺寸: {ocr_width}x{ocr_height}")
            print(f"     精确缩放比例: X={scale_x:.3f}, Y={scale_y:.3f}")
        elif max_x > 0 and max_y > 0:
            # 计算原始缩放比例
            raw_scale_x = img.width / max_x
            raw_scale_y = img.height / max_y

            # 检查宽高比是否接近（OCR是否保持了原图比例）
            img_ratio = img.width / img.height
            ocr_ratio = max_x / max_y
            ratio_diff = abs(img_ratio - ocr_ratio)

            print(f"  📊 宽高比分析: 原图={img_ratio:.3f}, OCR={ocr_ratio:.3f}, 差异={ratio_diff:.3f}")

            if ratio_diff < 0.15:
                # 宽高比接近，使用平均缩放比例（保持比例一致）
                avg_scale = (raw_scale_x + raw_scale_y) / 2
                scale_x = avg_scale
                scale_y = avg_scale
                print(f"  ✅ 使用统一缩放比例: {avg_scale:.3f}")
            else:
                # 宽高比差异大，可能OCR使用了固定尺寸
                # 尝试常见的OCR基准宽度
                common_bases = [1024, 960, 800, 768]
                best_match = None
                best_diff = float('inf')

                for base_w in common_bases:
                    # 假设OCR按宽度缩放，计算期望的坐标范围
                    expected_scale = img.width / base_w
                    expected_max_x = img.width / expected_scale
                    diff = abs(max_x - expected_max_x)
                    if diff < best_diff:
                        best_diff = diff
                        best_match = (base_w, expected_scale)

                if best_match and best_diff < 100:
                    scale_x = best_match[1]
                    # Y方向使用实际比例（通常需要更大的缩放）
                    scale_y = raw_scale_y
                    print(f"  ✅ 匹配到OCR基准宽度 {best_match[0]}px")
                    print(f"     X缩放: {scale_x:.3f}, Y缩放: {scale_y:.3f}")
                else:
                    # 无法匹配，使用独立的X/Y缩放
                    scale_x = raw_scale_x
                    scale_y = raw_scale_y
                    print(f"  ⚠️ 使用独立缩放: X={scale_x:.3f}, Y={scale_y:.3f}")

        if scale_x != 1.0 or scale_y != 1.0:
            print(f"  🔍 检测到坐标需要缩放: X={scale_x:.2f}, Y={scale_y:.2f}")
            print(f"     OCR坐标范围: {max_x}x{max_y} -> 图片尺寸: {img.width}x{img.height}")

        # 分析图片结构（单张或拼接）
        print(f"\n🔍 图片结构分析:")
        print(f"{'='*80}")
        analyze_image_structure(ocr_result.boxes_data)
        print(f"{'='*80}")

        # 打印文本对照表
        print(f"\n📋 文本块对照表:")
        print(f"{'='*80}")
        for i, box in enumerate(ocr_result.boxes_data):
            x, y, w, h = box.get("bbox", [0, 0, 0, 0])
            confidence = box.get("confidence", 0)
            text = box.get("text", "")
            region = box.get("region", "unknown")  # 添加region显示

            # 清理文本，移除换行符
            clean_text = text.replace('\n', ' ').replace('\r', ' ')
            if len(clean_text) > 60:
                clean_text = clean_text[:60] + "..."

            # 显示缩放后的坐标
            sx, sy, sw, sh = int(x*scale_x), int(y*scale_y), int(w*scale_x), int(h*scale_y)
            print(f"[{i:2d}] 置信度:{confidence:.3f} | 原坐标:({x},{y},{w},{h}) | 缩放后:({sx},{sy},{sw},{sh}) | {clean_text}")
        print(f"{'='*80}")

        # 绘制每个文本块
        for i, box in enumerate(ocr_result.boxes_data):
            x, y, w, h = box.get("bbox", [0, 0, 0, 0])
            # 应用缩放
            x = int(x * scale_x)
            y = int(y * scale_y)
            w = int(w * scale_x)
            h = int(h * scale_y)
            confidence = box.get("confidence", 0)
            text = box.get("text", "")

            # 根据置信度选择颜色（尝试多种格式）
            if confidence >= 0.8:
                # 红色 - 高置信度
                outline_color = (255, 0, 0, 255)  # 尝试RGBA
            elif confidence >= 0.5:
                # 橙色 - 中等置信度
                outline_color = (255, 165, 0, 255)  # 尝试RGBA
            else:
                # 蓝色 - 低置信度
                outline_color = (0, 0, 255, 255)  # 尝试RGBA

            # 绘制边界框
            try:
                # 尝试带透明度的RGBA
                draw.rectangle([x, y, x + w, y + h], outline=outline_color, width=2)
            except TypeError as e:
                print(f"    ⚠️ RGBA失败，尝试RGB: {e}")
                try:
                    # 尝试RGB
                    rgb_color = outline_color[:3]  # 取前3个元素
                    draw.rectangle([x, y, x + w, y + h], outline=rgb_color, width=2)
                except TypeError as e2:
                    print(f"    ⚠️ RGB失败，尝试整数: {e2}")
                    try:
                        # 尝试整数形式 (R << 16) + (G << 8) + B
                        r, g, b = outline_color[:3]
                        int_color = (r << 16) | (g << 8) | b
                        draw.rectangle([x, y, x + w, y + h], outline=int_color, width=2)
                    except Exception as e3:
                        print(f"    ❌ 所有颜色格式都失败: {e3}")
                        # 回退到黑色
                        draw.rectangle([x, y, x + w, y + h], outline=(0, 0, 0), width=2)

            # 简化版：在文本框上显示编号（避免中文字体问题）
            try:
                # 显示编号和置信度
                label = f"#{i} ({confidence:.2f})"

                # 如果文本框足够大，显示标签
                if w > 60 and h > 30:
                    # 标签位置：文本框内部左上角
                    text_x = x + 5
                    text_y = y + 5

                    # 绘制标签背景（根据置信度选择颜色）
                    if confidence >= 0.8:
                        # 高置信度：红色背景
                        bg_color = (255, 200, 200)  # 浅红色
                    elif confidence >= 0.5:
                        # 中等置信度：橙色背景
                        bg_color = (255, 220, 150)  # 浅橙色
                    else:
                        # 低置信度：蓝色背景
                        bg_color = (200, 200, 255)  # 浅蓝色

                    # 绘制背景
                    draw.rectangle([text_x, text_y, text_x + 80, text_y + 20], fill=bg_color)

                    # 绘制标签文本
                    try:
                        draw.text((text_x + 5, text_y + 5), label, fill=(0, 0, 0))
                    except:
                        # 如果失败，跳过
                        pass

            except Exception as e:
                # 标签绘制失败不影响边框绘制
                pass

        # 保存或显示结果
        if output_path:
            img.save(output_path)
            print(f"  💾 可视化结果已保存: {output_path}")
            return output_path
        else:
            # 生成默认输出路径
            base_path = Path(image_path)
            output_path = str(base_path.parent / f"{base_path.stem}_ocr_visualized{base_path.suffix}")
            img.save(output_path)
            print(f"  💾 可视化结果已保存: {output_path}")
            return output_path

    except Exception as e:
        print(f"  ❌ 可视化失败: {str(e)}")
        return None

def calculate_ocr_statistics(ocr_results: List[OCRResult]) -> Dict:
    """
    计算OCR识别统计信息
    """
    if not ocr_results:
        return {}

    total_text_blocks = sum(len(r.boxes_data) for r in ocr_results if r.success)
    total_chars = sum(len(r.full_text) for r in ocr_results if r.success)

    # 置信度统计
    all_confidences = []
    for result in ocr_results:
        if result.success:
            all_confidences.extend([box.get("confidence", 0) for box in result.boxes_data])

    stats = {
        "total_images": len(ocr_results),
        "success_images": sum(1 for r in ocr_results if r.success),
        "failed_images": sum(1 for r in ocr_results if not r.success),
        "total_text_blocks": total_text_blocks,
        "total_characters": total_chars,
        "avg_confidence": sum(all_confidences) / len(all_confidences) if all_confidences else 0,
        "min_confidence": min(all_confidences) if all_confidences else 0,
        "max_confidence": max(all_confidences) if all_confidences else 0,
        "confidence_distribution": {
            "high (>=0.8)": sum(1 for c in all_confidences if c >= 0.8),
            "medium (0.5-0.8)": sum(1 for c in all_confidences if 0.5 <= c < 0.8),
            "low (<0.5)": sum(1 for c in all_confidences if c < 0.5)
        }
    }

    return stats

def generate_html_report(ocr_results: List[OCRResult], output_dir: str, image_dir: str = None):
    """
    生成HTML测试报告
    """
    try:
        stats = calculate_ocr_statistics(ocr_results)

        html_content = f"""
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OCR测试报告</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; }}
        .header {{ background: #f5f5f5; padding: 20px; border-radius: 5px; }}
        .stats {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin: 20px 0; }}
        .stat-card {{ background: white; padding: 15px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
        .result {{ margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }}
        .success {{ border-left: 4px solid #4CAF50; }}
        .failed {{ border-left: 4px solid #f44336; }}
        .boxes {{ margin-top: 10px; }}
        .box {{ background: #f9f9f9; padding: 8px; margin: 5px 0; border-radius: 3px; }}
        pre {{ background: #f5f5f5; padding: 10px; border-radius: 3px; overflow-x: auto; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>OCR识别测试报告</h1>
        <p>生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
    </div>

    <div class="stats">
        <div class="stat-card">
            <h3>总体统计</h3>
            <p>总图片数: {stats.get('total_images', 0)}</p>
            <p>成功: {stats.get('success_images', 0)}</p>
            <p>失败: {stats.get('failed_images', 0)}</p>
        </div>
        <div class="stat-card">
            <h3>文本统计</h3>
            <p>文本块总数: {stats.get('total_text_blocks', 0)}</p>
            <p>字符总数: {stats.get('total_characters', 0)}</p>
            <p>平均文本块/图片: {stats.get('total_text_blocks', 0) / max(1, stats.get('success_images', 0)):.1f}</p>
        </div>
        <div class="stat-card">
            <h3>置信度统计</h3>
            <p>平均: {stats.get('avg_confidence', 0):.3f}</p>
            <p>最高: {stats.get('max_confidence', 0):.3f}</p>
            <p>最低: {stats.get('min_confidence', 0):.3f}</p>
        </div>
    </div>

    <h2>识别结果详情</h2>
"""

        for i, result in enumerate(ocr_results, 1):
            status_class = "success" if result.success else "failed"
            status_text = "✅ 成功" if result.success else "❌ 失败"

            html_content += f"""
    <div class="result {status_class}">
        <h3>{status_text} - 图片 {i}</h3>
        <p>文件ID: {result.file_id}</p>
        <p>处理时间: {result.processing_time:.2f}秒</p>
"""

            if result.success:
                html_content += f"""
        <p><strong>完整文本:</strong></p>
        <pre>{result.full_text}</pre>

        <div class="boxes">
            <p><strong>文本块 ({len(result.boxes_data)}):</strong></p>
"""
                for j, box in enumerate(result.boxes_data):
                    html_content += f"""
            <div class="box">
                <strong>块 {j}:</strong> {box.get('text', '')}<br>
                <small>边界框: {box.get('bbox', [])} | 置信度: {box.get('confidence', 0):.3f}</small>
            </div>
"""
                html_content += "</div>"

            else:
                html_content += f"""
        <p><strong>错误信息:</strong> {result.error}</p>
"""

            html_content += "    </div>\n"

        html_content += """
</body>
</html>
"""

        # 保存HTML报告
        report_path = Path(output_dir) / "ocr_test_report.html"
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write(html_content)

        print(f"  📄 HTML报告已生成: {report_path}")
        return report_path

    except Exception as e:
        print(f"  ❌ 生成HTML报告失败: {str(e)}")
        return None

# ==================== 主处理流程 ====================
def process_image(image_url=None, image_path=None, output_file=None, visualize=False, output_dir=None):
    """
    处理单张图片的完整流程

    Args:
        image_url: 图片URL
        image_path: 本地图片路径
        output_file: 结果保存路径
        visualize: 是否生成可视化
        output_dir: 输出目录（用于保存可视化图片）
    """
    print(f"\n{'='*60}")
    print(f"🚀 开始处理图片")
    print(f"{'='*60}")

    start_time = time.time()

    # 1. 上传图片
    upload_result = upload_image(image_url=image_url, image_path=image_path)
    if not upload_result["success"]:
        return upload_result

    file_id = upload_result["file_id"]

    # 2. OCR识别
    ocr_result = ocr_recognize(file_id)
    ocr_result.file_id = file_id
    ocr_result.processing_time = time.time() - start_time

    # 3. 整理结果
    result = {
        "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "image_url": image_url,
        "image_path": image_path,
        "file_id": file_id,
        "processing_time": ocr_result.processing_time,
        "ocr_result": ocr_result.to_dict()
    }

    # 4. 打印结果
    print(f"\n{'='*60}")
    print(f"📊 处理结果")
    print(f"{'='*60}")

    if ocr_result.success:
        print(f"✅ 识别成功")
        print(f"📝 完整文本:\n{ocr_result.full_text}")
        print(f"\n📦 文本块数量: {len(ocr_result.boxes_data)}")
        print(f"⏱️ 处理时间: {ocr_result.processing_time:.2f}秒")

        # 5. 生成可视化
        if visualize and image_path and HAS_PIL:
            # 设置可视化输出路径
            if output_dir:
                # 如果指定了输出目录，在目录下创建可视化图片
                image_name = Path(image_path).stem + "_ocr_visualized.jpg"
                viz_path = str(Path(output_dir) / image_name)
            else:
                viz_path = None

            viz_result_path = visualize_ocr_result(image_path, ocr_result, output_path=viz_path)
            if viz_result_path:
                result["visualization_path"] = viz_result_path
                print(f"🎨 可视化: {viz_result_path}")
    else:
        print(f"❌ 识别失败: {ocr_result.error}")

    # 6. 保存结果
    if output_file:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"\n💾 结果已保存: {output_file}")

    print(f"\n{'='*60}\n")

    return result

def batch_process_from_directory(directory_path, output_dir=None, delay=0.5, visualize=False):
    """
    批量处理目录下的所有图片
    """
    print(f"\n{'='*60}")
    print(f"🚀 开始批量处理目录")
    print(f"{'='*60}")
    print(f"📂 目录: {directory_path}")

    supported_ext = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff'}

    image_files = []
    for ext in supported_ext:
        image_files.extend(Path(directory_path).glob(f'*{ext}'))
        image_files.extend(Path(directory_path).glob(f'*{ext.upper()}'))

    if not image_files:
        print(f"❌ 目录中没有找到支持的图片文件")
        return {"success": False, "error": "没有找到图片文件"}

    print(f"📊 找到 {len(image_files)} 张图片\n")

    # 创建输出目录
    viz_dir = None
    if output_dir:
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        print(f"💾 结果将保存到: {output_dir}")
        if visualize:
            viz_dir = Path(output_dir) / "visualizations"
            viz_dir.mkdir(exist_ok=True)
            print(f"🎨 可视化图片将保存到: {viz_dir}")

    # 批量处理
    results = []
    ocr_results = []

    for i, image_path in enumerate(image_files, 1):
        print(f"\n[{i}/{len(image_files)}] 处理: {image_path.name}")

        try:
            # 处理单张图片
            result = process_image(
                image_path=str(image_path),
                visualize=visualize,
                output_dir=str(viz_dir) if viz_dir else None
            )

            results.append(result)

            # 创建OCRResult对象用于统计
            if result.get("ocr_result", {}).get("success"):
                ocr_results.append(OCRResult.from_dict(result["ocr_result"]))

        except KeyboardInterrupt:
            print(f"\n⚠️ 用户中断，已处理 {i} 张图片")
            break
        except Exception as e:
            print(f"❌ 处理 {image_path.name} 时出错: {e}")
            continue

        # 请求间隔
        if i < len(image_files):
            time.sleep(delay)

    # 生成统计报告
    print(f"\n{'='*60}")
    print(f"📊 批量处理完成")
    print(f"{'='*60}")
    print(f"总计: {len(results)} 张")
    print(f"成功: {sum(1 for r in results if r.get('ocr_result', {}).get('success'))} 张")
    print(f"失败: {sum(1 for r in results if not r.get('ocr_result', {}).get('success'))} 张")

    if ocr_results:
        stats = calculate_ocr_statistics(ocr_results)
        print(f"\n📈 OCR统计:")
        print(f"  平均置信度: {stats['avg_confidence']:.3f}")
        print(f"  文本块总数: {stats['total_text_blocks']}")
        print(f"  字符总数: {stats['total_characters']}")

    # 生成HTML报告
    if output_dir:
        report_path = generate_html_report(ocr_results, output_dir)
        if report_path:
            print(f"\n📄 详细报告: {report_path}")

    print(f"{'='*60}\n")

    return {
        "total": len(results),
        "results": results
    }

# ==================== 命令行接口 ====================
def main():
    """主函数"""
    print("\n")
    print("="*60)
    print("🧪 Dify OCR 增强版测试套件")
    print("="*60)
    print("\n此脚本将:")
    print("  1. 检查依赖库")
    print("  2. 执行OCR识别")
    print("  3. 分析图片结构（单张/拼接）")
    print("  4. 生成可视化图片")
    print("  5. 生成详细报告")

    # 检查依赖
    if not check_dependencies():
        print("\n❌ 依赖检查失败，请先安装依赖")
        return

    # 打印测试流程
    print_step_by_step_test()

    parser = argparse.ArgumentParser(
        description="Dify OCR增强版 - 支持坐标测试和可视化",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用示例:
  # 1. 单张图片识别 + 可视化
  python dify_ocr_enhanced.py --path "/path/to/image.jpg" --visualize

  # 2. 单张图片识别，保存结果
  python dify_ocr_enhanced.py --path "/path/to/image.jpg" --output result.json

  # 3. 批量处理 + 可视化
  python dify_ocr_enhanced.py --batch-dir "/path/to/images" --output-dir results --visualize

  # 4. 批量处理不显示置信度
  python dify_ocr_enhanced.py --batch-dir "/path/to/images" --output-dir results --no-confidence
        """
    )

    # 单张图片处理
    parser.add_argument('--url', type=str, help='图片的远程URL')
    parser.add_argument('--path', type=str, help='本地图片路径')
    parser.add_argument('--output', type=str, help='结果保存路径（JSON格式）')

    # 批量处理
    parser.add_argument('--batch-dir', type=str, help='批量处理目录')
    parser.add_argument('--output-dir', type=str, help='批量处理的输出目录')

    # 可视化选项
    parser.add_argument('--visualize', action='store_true', default=True, help='生成可视化图片（默认开启）')
    parser.add_argument('--no-visualize', action='store_false', dest='visualize', help='不生成可视化图片')
    parser.add_argument('--no-confidence', action='store_true', help='可视化时不显示置信度')

    # 其他选项
    parser.add_argument('--delay', type=float, default=0.5, help='批量处理时的请求间隔（秒），默认0.5')

    args = parser.parse_args()

    # 验证参数
    single_mode = args.url or args.path
    batch_mode = args.batch_dir

    if not single_mode and not batch_mode:
        print("❌ 错误: 必须提供以下参数之一:")
        print("   - 单张图片: --url 或 --path")
        print("   - 批量处理: --batch-dir")
        print("\n使用 --help 查看帮助")
        sys.exit(1)

    if single_mode and batch_mode:
        print("❌ 错误: 不能同时使用单张处理和批量处理模式")
        sys.exit(1)

    # 执行处理
    try:
        if batch_mode:
            print(f"\n📂 批量处理目录模式")
            print(f"   目录: {args.batch_dir}")
            print(f"   间隔: {args.delay}秒")
            print(f"   可视化: {'开启' if args.visualize else '关闭'}")

            summary = batch_process_from_directory(
                directory_path=args.batch_dir,
                output_dir=args.output_dir,
                delay=args.delay,
                visualize=args.visualize
            )

        else:
            result = process_image(
                image_url=args.url,
                image_path=args.path,
                output_file=args.output,
                visualize=args.visualize
            )

            if not result.get("ocr_result", {}).get("success", False):
                sys.exit(1)

    except KeyboardInterrupt:
        print("\n⚠️ 用户中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 处理异常: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    print("\n" + "="*60)
    print("✅ 测试完成！")
    print("="*60)

if __name__ == '__main__':
    main()
