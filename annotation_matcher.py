#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
智能标注匹配算法
将OCR坐标与智能标注进行匹配
"""

from typing import List, Dict, Any, Optional, Tuple
import re


class OCRBox:
    """OCR文本块数据类"""
    def __init__(self, text: str, bbox: List[float], confidence: float = 0.0, index: int = 0):
        self.text = text
        self.bbox = bbox  # [x, y, w, h]
        self.confidence = confidence
        self.index = index

    def to_dict(self) -> Dict[str, Any]:
        return {
            "text": self.text,
            "bbox": self.bbox,
            "confidence": self.confidence,
            "index": self.index
        }


class AnnotationMatcher:
    """智能标注匹配器"""

    @staticmethod
    def match_ocr_with_annotations(
        ocr_boxes: List[Dict[str, Any]],
        annotations: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        智能标注与OCR坐标匹配

        Args:
            ocr_boxes: OCR文本块列表
            annotations: 智能标注数据

        Returns:
            匹配结果列表，包含每个标注对应的OCR索引和坐标
        """
        matches = []

        # 转换为OCRBox对象列表
        boxes = [OCRBox(**box) for box in ocr_boxes]

        # 处理三种类型的标注
        for annotation_type in ["nice_sentence", "good_sentence", "improve_sentence"]:
            if annotation_type not in annotations or not annotations[annotation_type]:
                continue

            for annotation in annotations[annotation_type]:
                # 使用文本相似度匹配OCR块
                best_match = AnnotationMatcher._find_best_ocr_match(
                    annotation.get("text", ""), boxes
                )

                if best_match and best_match["similarity"] >= 0.3:
                    matches.append({
                        "type": annotation_type,
                        "annotation": annotation,
                        "ocr_index": best_match["index"],
                        "ocr_bbox": best_match["bbox"],
                        "similarity": best_match["similarity"],
                        "matched_text": best_match["text"],
                        "is_multi_block": best_match.get("is_multi_block", False),
                        "ocr_indexes": best_match.get("ocr_indexes", [best_match["index"]])
                    })

        return matches

    @staticmethod
    def _find_best_ocr_match(
        target_text: str,
        ocr_boxes: List[OCRBox]
    ) -> Optional[Dict[str, Any]]:
        """
        查找最佳OCR匹配

        支持单块匹配和多块合并匹配
        """
        # 首先尝试多块匹配（适用于长句子跨多行）
        multi_block_match = AnnotationMatcher._find_best_multi_block_match(target_text, ocr_boxes)

        # 然后尝试单块匹配
        single_block_match = AnnotationMatcher._find_best_single_block_match(target_text, ocr_boxes)

        # 选择最佳匹配
        if multi_block_match and multi_block_match["similarity"] > single_block_match["similarity"] * 1.1:
            return multi_block_match
        else:
            return single_block_match

    @staticmethod
    def _find_best_multi_block_match(
        target_text: str,
        ocr_boxes: List[OCRBox],
        max_window_size: int = 5
    ) -> Optional[Dict[str, Any]]:
        """使用滑动窗口查找最佳多块匹配"""
        best_match = {
            "index": -1,
            "similarity": 0,
            "text": "",
            "bbox": None,
            "is_multi_block": True,
            "ocr_indexes": []
        }

        # 尝试不同长度的窗口
        for length in range(1, min(max_window_size + 1, len(ocr_boxes) + 1)):
            for start in range(0, len(ocr_boxes) - length + 1):
                # 合并窗口内的文本
                merged_text = ""
                indexes = []

                for i in range(length):
                    box = ocr_boxes[start + i]
                    if box.text.strip():
                        merged_text += ("" if i == 0 else " ") + box.text.strip()
                        indexes.append(start + i)

                # 计算相似度
                similarity = AnnotationMatcher._calculate_text_similarity(target_text, merged_text)

                # 保留最佳匹配
                if similarity > best_match["similarity"]:
                    # 计算联合边界框
                    merged_bbox = AnnotationMatcher._calculate_merged_bbox(ocr_boxes, indexes)

                    best_match = {
                        "index": indexes[0],  # 兼容旧代码，返回第一个索引
                        "similarity": similarity,
                        "text": merged_text,
                        "bbox": merged_bbox,
                        "is_multi_block": True,
                        "ocr_indexes": indexes
                    }

        return best_match if best_match["index"] >= 0 else None

    @staticmethod
    def _find_best_single_block_match(
        target_text: str,
        ocr_boxes: List[OCRBox]
    ) -> Optional[Dict[str, Any]]:
        """查找最佳单块匹配"""
        best_match = {
            "index": -1,
            "similarity": 0,
            "text": "",
            "bbox": None,
            "is_multi_block": False,
            "ocr_indexes": []
        }

        for i, box in enumerate(ocr_boxes):
            similarity = AnnotationMatcher._calculate_text_similarity(target_text, box.text)
            if similarity > best_match["similarity"]:
                best_match = {
                    "index": i,
                    "similarity": similarity,
                    "text": box.text,
                    "bbox": box.bbox,
                    "is_multi_block": False,
                    "ocr_indexes": [i]
                }

        return best_match if best_match["index"] >= 0 else None

    @staticmethod
    def _calculate_text_similarity(text1: str, text2: str) -> float:
        """
        计算文本相似度

        综合使用编辑距离、词汇匹配和LCS三种方法
        返回0-1之间的相似度
        """
        if not text1 or not text2:
            return 0.0

        # 预处理：转小写、去除标点符号和多余空格
        norm_text1 = AnnotationMatcher._normalize_text(text1)
        norm_text2 = AnnotationMatcher._normalize_text(text2)

        if not norm_text1 or not norm_text2:
            return 0.0

        # 方法1：编辑距离相似度
        edit_similarity = AnnotationMatcher._edit_distance_similarity(norm_text1, norm_text2)

        # 方法2：词汇重叠相似度
        word_similarity = AnnotationMatcher._word_overlap_similarity(norm_text1, norm_text2)

        # 方法3：最长公共子序列相似度
        lcs_similarity = AnnotationMatcher._lcs_similarity(norm_text1, norm_text2)

        # 综合三种方法（权重可调整）
        combined_similarity = (
            edit_similarity * 0.4 +
            word_similarity * 0.4 +
            lcs_similarity * 0.2
        )

        return combined_similarity

    @staticmethod
    def _normalize_text(text: str) -> str:
        """文本预处理"""
        return text.lower().replace("[^\w\s]", " ").replace("\s+", " ").strip()

    @staticmethod
    def _edit_distance_similarity(text1: str, text2: str) -> float:
        """编辑距离相似度"""
        max_len = max(len(text1), len(text2))
        if max_len == 0:
            return 1.0

        edit_dist = AnnotationMatcher._edit_distance(text1, text2)
        return 1.0 - (edit_dist / max_len)

    @staticmethod
    def _edit_distance(text1: str, text2: str) -> int:
        """计算编辑距离（动态规划）"""
        m, n = len(text1), len(text2)
        dp = [[0] * (n + 1) for _ in range(m + 1)]

        for i in range(m + 1):
            dp[i][0] = i
        for j in range(n + 1):
            dp[0][j] = j

        for i in range(1, m + 1):
            for j in range(1, n + 1):
                if text1[i - 1] == text2[j - 1]:
                    dp[i][j] = dp[i - 1][j - 1]
                else:
                    dp[i][j] = 1 + min(
                        dp[i - 1][j],      # 删除
                        dp[i][j - 1],      # 插入
                        dp[i - 1][j - 1]   # 替换
                    )

        return dp[m][n]

    @staticmethod
    def _word_overlap_similarity(text1: str, text2: str) -> float:
        """词汇重叠相似度"""
        words1 = set(text1.split())
        words2 = set(text2.split())

        if not words1 and not words2:
            return 1.0
        if not words1 or not words2:
            return 0.0

        intersection = len(words1.intersection(words2))
        union = len(words1.union(words2))

        return intersection / union if union > 0 else 0.0

    @staticmethod
    def _lcs_similarity(text1: str, text2: str) -> float:
        """最长公共子序列相似度"""
        m, n = len(text1), len(text2)
        if m == 0 and n == 0:
            return 1.0
        if m == 0 or n == 0:
            return 0.0

        dp = [[0] * (n + 1) for _ in range(m + 1)]

        for i in range(1, m + 1):
            for j in range(1, n + 1):
                if text1[i - 1] == text2[j - 1]:
                    dp[i][j] = dp[i - 1][j - 1] + 1
                else:
                    dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])

        lcs_length = dp[m][n]
        return (2 * lcs_length) / (m + n)

    @staticmethod
    def _calculate_merged_bbox(ocr_boxes: List[OCRBox], indexes: List[int]) -> List[float]:
        """
        计算多个OCR块的联合边界框
        """
        if not indexes:
            return [0, 0, 0, 0]

        # 提取所有边界框
        bboxes = [ocr_boxes[i].bbox for i in indexes if ocr_boxes[i].bbox]

        if not bboxes:
            return [0, 0, 0, 0]

        # 计算联合边界框
        x1 = min(bbox[0] for bbox in bboxes)
        y1 = min(bbox[1] for bbox in bboxes)
        x2 = max(bbox[0] + bbox[2] for bbox in bboxes)
        y2 = max(bbox[1] + bbox[3] for bbox in bboxes)

        return [x1, y1, x2 - x1, y2 - y1]


# 测试代码
if __name__ == "__main__":
    # 测试数据
    ocr_boxes = [
        {"text": "Hello", "bbox": [100, 200, 150, 30], "confidence": 0.95, "index": 0},
        {"text": "world", "bbox": [100, 250, 150, 30], "confidence": 0.92, "index": 1},
        {"text": "This is", "bbox": [100, 300, 150, 30], "confidence": 0.98, "index": 2},
        {"text": "a test", "bbox": [100, 350, 150, 30], "confidence": 0.90, "index": 3},
    ]

    annotations = {
        "nice_sentence": [
            {"text": "Hello world", "nice_reason": "很好的问候语"}
        ],
        "good_sentence": [
            {"text": "This is a test", "good_reason": "结构清晰"}
        ]
    }

    # 执行匹配
    matches = AnnotationMatcher.match_ocr_with_annotations(ocr_boxes, annotations)

    print("匹配结果:")
    for match in matches:
        print(f"类型: {match['type']}")
        print(f"标注文本: {match['annotation']}")
        print(f"OCR索引: {match['ocr_index']}")
        print(f"相似度: {match['similarity']:.3f}")
        print(f"是否多块: {match['is_multi_block']}")
        print("-" * 50)
