#!/bin/bash

echo "开始处理剩余的 $(git status --porcelain | wc -l) 个文件..."

# 计数器
TOTAL_PROCESSED=0
BATCH_NUMBER=1

# 循环处理所有文件，每次处理1000个
while [ $(git status --porcelain | wc -l) -gt 0 ]; do
    echo "==============================="
    echo "处理第 $BATCH_NUMBER 批文件..."
    echo "==============================="
    
    # 获取当前批次的文件数量
    BATCH_COUNT=$(git status --porcelain | head -1000 | wc -l)
    echo "本批处理 $BATCH_COUNT 个文件"
    
    # 使用安全的方式添加文件
    git status --porcelain | head -1000 | while IFS= read -r line; do
        # 提取状态和文件名
        STATUS=${line:0:2}
        FILENAME=${line:3}
        
        # 检查文件是否存在
        if [ -e "$FILENAME" ] || [ -L "$FILENAME" ]; then
            git add "$FILENAME"
            TOTAL_PROCESSED=$((TOTAL_PROCESSED + 1))
            echo "✓ 已添加 ($TOTAL_PROCESSED): $FILENAME"
        else
            echo "⚠ 跳过不存在的文件: $FILENAME"
        fi
    done
    
    # 提交当前批次
    git commit -m "批量提交: 第${BATCH_NUMBER}批文件 (${BATCH_COUNT}个文件)"
    echo "第 $BATCH_NUMBER 批已提交"
    
    # 推送到远程仓库
    echo "正在推送第 $BATCH_NUMBER 批到远程仓库..."
    git push origin main:main
    
    if [ $? -eq 0 ]; then
        echo "✓ 第 $BATCH_NUMBER 批推送成功"
    else
        echo "✗ 第 $BATCH_NUMBER 批推送失败，但文件已提交到本地"
    fi
    
    BATCH_NUMBER=$((BATCH_NUMBER + 1))
    
    # 显示剩余文件数
    REMAINING=$(git status --porcelain | wc -l)
    echo "剩余文件数: $REMAINING"
    echo ""
    
    # 如果还有文件，短暂休息避免服务器压力
    if [ $REMAINING -gt 0 ]; then
        echo "等待5秒后继续处理下一批..."
        sleep 5
    fi
done

echo "=================================="
echo "所有文件处理完成！"
echo "总共处理了 $TOTAL_PROCESSED 个文件"
echo "共分为 $((BATCH_NUMBER - 1)) 批提交"
echo "=================================="
