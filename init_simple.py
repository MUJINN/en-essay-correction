#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
简化版初始化脚本
"""

from simple_storage import SimpleStorage, init_storage as init_storage_func
import json


def init_storage():
    """初始化存储"""
    print("🔧 初始化文件存储...")
    init_storage_func()

    # 显示存储信息
    info = SimpleStorage.get_storage_info()
    print("\n📊 存储信息:")
    print(json.dumps(info, ensure_ascii=False, indent=2))

    print("\n✅ 文件存储初始化完成")
    print("💡 数据将保存在 data/ 目录中")
    print("   - ocr_data.json: OCR识别结果")
    print("   - correction_data.json: 批改结果")
    print("   - history.json: 历史记录")


if __name__ == "__main__":
    init_storage()
