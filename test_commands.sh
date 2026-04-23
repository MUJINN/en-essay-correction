#!/bin/bash
# 英语作文批改系统 - API测试命令

# 1. 启动服务
echo "启动API服务..."
source venv/bin/activate
uvicorn api_v2:app_v2 --host 0.0.0.0 --port 8008 &

# 等待服务启动
sleep 3

# 2. 测试历史记录列表
echo -e "\n=== 测试历史记录列表 ==="
curl -s http://localhost:8008/api/v2/history/list | jq

# 3. 测试批改接口
echo -e "\n=== 测试批改接口 ==="
curl -X POST http://localhost:8008/api/v2/correct \
  -H "Content-Type: application/json" \
  -d @test_correction.json \
  | jq '.data.score, .data.outputs.score_dimension[0]'

echo -e "\n=== 测试完成 ==="
