#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json

# 读取batch_results.json（AI打分结果）
with open('/home/wangdi5/en-essay-correction/data/125531382/batch_results.json', 'r', encoding='utf-8') as f:
    batch_results = json.load(f)

# 读取125531382.json（老师打分）
with open('/home/wangdi5/en-essay-correction/data/125531382/125531382.json', 'r', encoding='utf-8') as f:
    teacher_scores_data = json.load(f)

# 构建老师打分的字典，键为考号，值为分数
teacher_scores_dict = {}
for item in teacher_scores_data[0]['scores']:
    kaohao = item['kaohao']
    score = item['score']
    teacher_scores_dict[kaohao] = score

# 构建AI打分和老师打分的对比数据
comparison_data = []

for result in batch_results['results']:
    student_id = result['student_id']
    ai_score = result['score']
    success = result['success']

    # 获取老师打分
    teacher_score = teacher_scores_dict.get(student_id, None)

    # 计算差异（AI分数 - 老师分数）
    if ai_score is not None and teacher_score is not None:
        score_diff = ai_score - teacher_score
    else:
        score_diff = None

    comparison_data.append({
        'student_id': student_id,
        'ai_score': ai_score,
        'teacher_score': teacher_score,
        'score_difference': score_diff,
        'success': success
    })

# 按student_id排序
comparison_data.sort(key=lambda x: x['student_id'])

# 保存到新的JSON文件
output_file = '/home/wangdi5/en-essay-correction/data/125531382/score_comparison.json'
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(comparison_data, f, ensure_ascii=False, indent=2)

print(f"对比数据已保存到: {output_file}")
print(f"总共处理了 {len(comparison_data)} 条记录")

# 统计信息
success_count = sum(1 for item in comparison_data if item['success'])
has_both_scores = sum(1 for item in comparison_data if item['ai_score'] is not None and item['teacher_score'] is not None)
print(f"成功批改的作文: {success_count} 篇")
print(f"同时有AI和老师打分的: {has_both_scores} 篇")

# 计算平均差异
differences = [item['score_difference'] for item in comparison_data if item['score_difference'] is not None]
if differences:
    avg_diff = sum(differences) / len(differences)
    print(f"AI与老师打分的平均差异: {avg_diff:.2f}")
    print(f"差异范围: {min(differences)} 到 {max(differences)}")
