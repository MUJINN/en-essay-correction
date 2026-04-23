# API 接口文档

## 基础信息

- **Base URL**: `http://10.10.2.40:8008`
- **Content-Type**: `application/json`
- **编码**: UTF-8

---

## 接口列表

### 1. OCR 文字识别

#### 接口信息
- **路径**: `/api/v2/ocr`
- **方法**: `POST`
- **Content-Type**: `multipart/form-data`
- **功能**: 上传作文图片，识别文字和坐标

#### 请求参数
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| image  | File | 是   | 图片文件（PNG/JPG/JPEG） |

#### 响应示例
```json
{
  "success": true,
  "boxes_data": [
    {
      "text": "Dear Chris,",
      "bbox": [100, 200, 150, 30],
      "confidence": 0.98,
      "index": 0
    }
  ],
  "full_text": "Dear Chris,\n\nI am writing to...",
  "image_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "created_at": "2024-11-26T10:30:00"
}
```

#### 字段说明
- `boxes_data`: OCR识别的文本块数组
  - `text`: 文本内容
  - `bbox`: 边界框 [x, y, width, height]
  - `confidence`: 置信度 (0-1)
  - `index`: 文本块索引
- `full_text`: 完整识别文本
- `image_id`: 图片唯一标识（用于后续关联）

---

### 2. 作文批改（核心接口）

#### 接口信息
- **路径**: `/api/v2/correct`
- **方法**: `POST`
- **Content-Type**: `application/json`
- **功能**: 批改作文，返回评分、评价和智能标注

#### 请求体
```json
{
  "task_key": "web-demo-1234567890",
  "grade": "高中三年级",
  "subject_chs": "英语",
  "question_content": "假设你校将举办外语节...",
  "total_score": "25",
  "student_answer": "Dear Chris,\n\nI am writing to...",
  "breakdown_type": "书面表达",
  "ocr_data": {
    "success": true,
    "boxes_data": [...],
    "full_text": "...",
    "image_id": "uuid",
    "created_at": "2024-11-26T10:30:00"
  },
  "image_data": "data:image/png;base64,iVBORw0KGgo...",
  "image_id": "a1b2c3d4-..."
}
```

#### 参数说明
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| task_key | string | 是 | 任务唯一标识 |
| grade | string | 是 | 年级（如"高中三年级"） |
| subject_chs | string | 是 | 科目（默认"英语"） |
| question_content | string | 是 | 题目内容 |
| total_score | string | 是 | 总分 |
| student_answer | string | 是 | 学生答案 |
| breakdown_type | string | 否 | 题型 |
| ocr_data | object | 否 | OCR识别结果（图片模式必填） |
| image_data | string | 否 | Base64编码的图片数据 |
| image_id | string | 否 | 图片ID（与OCR关联） |

#### 响应示例
```json
{
  "success": true,
  "data": {
    "outputs": {
      "score": 20.5,
      "score_dimension": [
        {
          "name": "内容",
          "score": 7,
          "total": 8,
          "comment": "内容完整..."
        }
      ],
      "composition_basic_info": {
        "word_count": 150,
        "sentence_count": 12
      },
      "composition_overall_evaluation": {
        "strengths": ["语言流畅", "结构清晰"],
        "weaknesses": ["部分词汇使用不当"],
        "suggestions": ["建议增加高级词汇"]
      },
      "intelligent_annotation": {
        "nice_sentence": [
          {
            "text": "Looking forward to your early reply.",
            "reason": "地道的书信结尾表达"
          }
        ],
        "good_sentence": [...],
        "improve_sentence": [
          {
            "text": "I am writing to invite you to participate",
            "reason": "可以使用更简洁的表达",
            "suggestion": "I am writing to invite you to"
          }
        ]
      }
    },
    "result": {
      "workflow_run_id": "wr_abc123",
      "score": 20.5,
      "ocr_annotation_match": [
        {
          "type": "nice_sentence",
          "annotation": {...},
          "ocr_index": 10,
          "ocr_bbox": [100, 500, 350, 25],
          "similarity": 0.95,
          "matched_text": "Looking forward to your early reply.",
          "is_multi_block": false
        }
      ],
      "elapsed_time": 5.2,
      "total_tokens": 1500
    }
  }
}
```

#### 字段说明
- `outputs`: 工作流原始输出
  - `score`: 总分
  - `score_dimension`: 各维度评分
  - `composition_basic_info`: 作文基本信息
  - `composition_overall_evaluation`: 整体评价
  - `intelligent_annotation`: 智能标注
- `result`: 处理后的结果
  - `ocr_annotation_match`: OCR坐标与标注的匹配关系（用于前端绘制标注框）

---

### 3. 历史记录列表

#### 接口信息
- **路径**: `/api/v2/history/list`
- **方法**: `GET`
- **功能**: 获取历史记录列表（支持分页和搜索）

#### 请求参数
| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| page   | int  | 否   | 1      | 页码 |
| size   | int  | 否   | 20     | 每页数量 |
| grade  | string | 否 | -    | 年级过滤 |
| search | string | 否 | -    | 搜索关键词 |

#### 响应示例
```json
{
  "success": true,
  "data": {
    "total": 100,
    "page": 1,
    "size": 20,
    "records": [
      {
        "id": "record-uuid",
        "timestamp": "2024-11-26T10:30:00",
        "task_key": "web-demo-1234",
        "grade": "高中三年级",
        "subject_chs": "英语",
        "question_content": "假设你校将举办外语节...",
        "total_score": "25",
        "student_answer": "Dear Chris,...",
        "breakdown_type": "书面表达",
        "image_data": "data:image/png;base64,...",
        "ocr_data": {...},
        "outputs": {...},
        "score": 20.5
      }
    ]
  }
}
```

---

### 4. 历史记录详情

#### 接口信息
- **路径**: `/api/v2/history/{record_id}`
- **方法**: `GET`
- **功能**: 获取单条历史记录的完整详情

#### 路径参数
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| record_id | string | 是 | 记录ID |

#### 响应示例
```json
{
  "success": true,
  "data": {
    "record": {
      "id": "record-uuid",
      "timestamp": "2024-11-26T10:30:00",
      ...
    },
    "ocr_data": {
      "success": true,
      "boxes_data": [...],
      "full_text": "...",
      "image_id": "...",
      "created_at": "..."
    },
    "correction_result": {
      "workflow_run_id": "wr_abc123",
      "score": 20.5,
      "score_dimension": [...],
      "intelligent_annotation": {...},
      "ocr_annotation_match": [...]
    }
  }
}
```

---

### 5. 加载示例数据

#### 接口信息
- **路径**: `/api/load-example`
- **方法**: `GET`
- **功能**: 获取示例作文数据（用于演示和测试）

#### 响应示例
```json
{
  "success": true,
  "data": {
    "question_content": "假设你校将举办外语节...",
    "student_answer": "Dear Chris,\n\n...",
    "grade": "高中三年级",
    "total_score": "25",
    "subject_chs": "英语",
    "breakdown_type": "书面表达"
  }
}
```

---

### 6. 历史记录列表（兼容版）

#### 接口信息
- **路径**: `/api/history/list`
- **方法**: `GET`
- **功能**: 兼容旧版前端的历史记录列表

#### 请求参数
| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| page   | int  | 否   | 1      | 页码 |
| size   | int  | 否   | 10     | 每页数量 |

#### 响应示例
```json
{
  "success": true,
  "data": {
    "total": 100,
    "page": 1,
    "size": 10,
    "files": [
      {
        "filename": "web-demo-1234_a1b2c3d4.json",
        "modified_time": "2024-11-26T10:30:00",
        "size": 5432,
        "record_id": "record-uuid",
        "preview": {
          "grade": "高中三年级",
          "score": 20.5,
          "student_answer": "Dear Chris,...",
          "question_content": "假设你校将举办..."
        }
      }
    ],
    "records": [...]
  }
}
```

---

### 7. 导出所有历史记录

#### 接口信息
- **路径**: `/api/history/export-all`
- **方法**: `GET`
- **功能**: 导出所有历史记录（最多1000条）

#### 响应格式
与 `/api/history/list` 相同，但返回所有记录。

---

### 8. 下载历史记录

#### 接口信息
- **路径**: `/api/history/download/{filename}`
- **方法**: `GET`
- **功能**: 下载单条历史记录的完整数据

#### 路径参数
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| filename | string | 是 | 文件名（如"web-demo-1234_a1b2c3d4.json"） |

#### 响应示例
```json
{
  "id": "record-uuid",
  "timestamp": "2024-11-26T10:30:00",
  "task_key": "web-demo-1234",
  "outputs": {...},
  "ocr_data": {...},
  "intelligent_annotation": {...},
  "ocr_annotation_match": [...],
  ...
}
```

---

### 9. 清空历史记录

#### 接口信息
- **路径**: `/api/history/clear`
- **方法**: `DELETE`
- **功能**: 清空所有历史记录（数据库版不支持）

#### 响应示例
```json
{
  "success": false,
  "message": "数据库版不支持清空历史记录功能"
}
```

---

### 10. 主页

#### 接口信息
- **路径**: `/`
- **方法**: `GET`
- **功能**: 返回前端主页 HTML

#### 响应
返回 `templates/index.html` 的内容。

---

## 错误处理

### 错误响应格式
```json
{
  "detail": "错误信息描述"
}
```

### 常见错误码
- `400`: 请求参数错误
- `404`: 资源不存在
- `500`: 服务器内部错误

### 错误示例
```json
{
  "detail": "OCR识别失败: 图片格式不支持"
}
```

---

## 附录

### OCR Box 数据结构
```typescript
interface OCRBox {
  text: string;           // 文本内容
  bbox: number[];         // 边界框 [x, y, width, height]
  confidence: number;     // 置信度 (0-1)
  index: number;          // 索引
}
```

### Intelligent Annotation 数据结构
```typescript
interface IntelligentAnnotation {
  nice_sentence: Array<{
    text: string;
    reason: string;
  }>;
  good_sentence: Array<{
    text: string;
    reason: string;
  }>;
  improve_sentence: Array<{
    text: string;
    reason: string;
    suggestion: string;
  }>;
}
```

### OCR Annotation Match 数据结构
```typescript
interface OCRAnnotationMatch {
  type: string;              // 标注类型: nice_sentence | good_sentence | improve_sentence
  annotation: object;        // 标注内容
  ocr_index: number;         // OCR块索引
  ocr_bbox: number[];        // OCR边界框
  similarity: number;        // 相似度
  matched_text: string;      // 匹配的文本
  is_multi_block: boolean;   // 是否多块匹配
  ocr_indexes?: number[];    // 涉及的OCR索引列表（多块匹配时）
}
```

---

## 联系方式

如有问题，请联系后端开发团队。
