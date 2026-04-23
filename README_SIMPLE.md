# 英语作文精批系统 - 简化版

## 特点

✅ **无数据库依赖** - 使用JSON文件存储
✅ **快速启动** - 无需安装SQLAlchemy等依赖
✅ **轻量级** - 仅需Python 3 + FastAPI
✅ **数据可见** - JSON文件可直接查看和编辑

## 快速开始

### 1. 安装依赖

```bash
pip install fastapi uvicorn requests
```

### 2. 初始化

```bash
python3 init_simple.py
```

### 3. 启动服务

```bash
python3 app_simple.py
# 或
uvicorn app_simple:app --host 10.10.2.40 --port 8008 --reload
```

### 4. 访问

- API文档：http://10.10.2.40:8008/docs

## API端点

### OCR识别
```
POST /api/v2/ocr
参数: multipart/form-data (image)
返回: OCR坐标数据 + 图片ID + ocr_id
```

### 批改API
```
POST /api/v2/correct
参数: {
    ocr_data: {...},      # OCR数据（可选）
    student_answer: "...",
    question_content: "...",
    grade: "...",
    ...
}
返回: 批改结果 + OCR坐标 + 历史记录ID
```

### 历史记录
```
GET /api/v2/history/list?page=1&size=20  # 列表
GET /api/v2/history/{record_id}           # 详情（包含OCR和批改结果）
```

## 数据存储

### 存储目录
```
data/
├── ocr_data.json          # OCR识别结果
├── correction_data.json   # 批改结果
└── history.json           # 历史记录
```

### 数据格式示例

**OCR数据 (ocr_data.json)**:
```json
[
  {
    "id": "ocr-uuid",
    "image_id": "image-uuid",
    "boxes_data": [
      {
        "text": "Hello world",
        "bbox": [100, 200, 150, 30],
        "confidence": 0.95,
        "index": 0
      }
    ],
    "full_text": "Hello world",
    "created_at": "2025-11-20T16:00:00"
  }
]
```

**历史记录 (history.json)**:
```json
[
  {
    "id": "history-uuid",
    "task_key": "web-demo-task",
    "grade": "高一",
    "subject_chs": "英语",
    "question_content": "Write an essay",
    "total_score": "15",
    "student_answer": "Hello world",
    "breakdown_type": "作文",
    "ocr_data_id": "ocr-uuid",
    "correction_result_id": "correction-uuid",
    "created_at": "2025-11-20T16:00:00",
    "updated_at": "2025-11-20T16:00:00"
  }
]
```

## 文件说明

### 核心文件
- `app_simple.py` - 简化版API服务
- `simple_storage.py` - 文件存储类
- `init_simple.py` - 初始化脚本

### 功能对比

| 功能 | 完整版 | 简化版 |
|------|--------|--------|
| **OCR识别** | ✅ | ✅ |
| **作文批改** | ✅ | ✅ |
| **智能标注匹配** | ✅ | ⚠️ 简化处理 |
| **历史记录** | ✅ | ✅ |
| **数据库** | ✅ SQLAlchemy | ❌ JSON文件 |
| **依赖** | sqlalchemy, pydantic | 仅fastapi, uvicorn, requests |
| **启动速度** | 慢 | 快 |

## 注意事项

1. **智能标注匹配**：
   - 简化版直接返回OCR坐标
   - 不进行复杂的后端匹配逻辑
   - 如需完整功能，请使用完整版（api_v2.py）

2. **数据一致性**：
   - JSON文件存储，无事务保证
   - 适合小规模使用（< 1000条记录）
   - 大规模使用建议使用完整版

3. **并发安全**：
   - 单进程使用安全
   - 多进程可能有写入冲突
   - 建议仅用于开发和测试

## 升级到完整版

如需更强大的功能，可以迁移到完整版：

```bash
# 完整版需要安装额外依赖
pip install sqlalchemy pydantic

# 启动完整版
python3 init_db.py
python3 api_v2.py
```

## 许可证

内部使用项目
