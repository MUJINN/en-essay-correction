#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
模型评分效果分析报告生成器
对比模型打分与老师打分的差异
"""

import json
import math
from collections import defaultdict
from datetime import datetime

def load_json(filepath):
    """加载JSON文件"""
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def analyze_scores():
    """分析模型与老师评分差异"""

    # 加载数据
    model_data = load_json('/home/wangdi5/en-essay-correction/data/125531382/batch_results.json')
    teacher_data = load_json('/home/wangdi5/en-essay-correction/data/125531382/125531382.json')

    # 提取模型分数（batch_results.json，只保留成功的）
    model_scores = {}
    model_dimensions = {}  # 存储维度评分
    failed_students = []
    if isinstance(model_data, dict) and 'results' in model_data:
        for result in model_data['results']:
            if isinstance(result, dict):
                if result.get('success', False):
                    student_id = result.get('student_id')
                    if student_id:
                        model_scores[student_id] = result.get('score', 0)
                        # 提取维度评分
                        model_dimensions[student_id] = result.get('score_dimension', [])
                else:
                    failed_students.append({
                        'student_id': result.get('student_id'),
                        'error': result.get('error', '未知错误')
                    })

    # 提取老师分数（125531382.json）
    teacher_scores = {}
    if isinstance(teacher_data, list) and len(teacher_data) > 0:
        entry = teacher_data[0]
        if isinstance(entry, dict) and 'scores' in entry:
            for score_info in entry['scores']:
                teacher_scores[score_info['kaohao']] = score_info['score']

    # 对比数据
    comparison = []
    dimension_comparison = []  # 存储维度评分对比
    for kaohao in teacher_scores:
        if kaohao in model_scores:
            model_score = model_scores[kaohao]
            teacher_score = teacher_scores[kaohao]
            diff = model_score - teacher_score
            abs_diff = abs(diff)

            # 查找对应的图片名
            image_name = None
            if isinstance(model_data, dict) and 'results' in model_data:
                for result in model_data['results']:
                    if isinstance(result, dict) and result.get('student_id') == kaohao:
                        image_name = result.get('image_name')
                        break

            # 获取模型维度评分
            model_dims = model_dimensions.get(kaohao, [])

            comparison.append({
                'kaohao': kaohao,
                'model_score': model_score,
                'teacher_score': teacher_score,
                'diff': diff,
                'abs_diff': abs_diff,
                'image_name': image_name,
                'score_dimension': model_dims  # 添加维度评分
            })

            # 对比维度评分
            for dim in model_dims:
                dimension_name = dim.get('dimension_name', '')
                model_dim_score = dim.get('dimension_score', 0)
                # 老师维度评分暂时设为0（因为老师数据中没有维度评分）
                teacher_dim_score = 0
                dim_diff = model_dim_score - teacher_dim_score

                dimension_comparison.append({
                    'kaohao': kaohao,
                    'dimension_name': dimension_name,
                    'model_dim_score': model_dim_score,
                    'teacher_dim_score': teacher_dim_score,
                    'dim_diff': dim_diff,
                    'dim_reason': dim.get('dimension_reason', '')
                })

    # 计算统计指标
    n = len(comparison)
    if n == 0:
        return None

    # 基本统计
    avg_model = sum(c['model_score'] for c in comparison) / n
    avg_teacher = sum(c['teacher_score'] for c in comparison) / n

    # 平均误差
    avg_diff = sum(c['diff'] for c in comparison) / n

    # 平均绝对误差
    avg_abs_diff = sum(c['abs_diff'] for c in comparison) / n

    # 标准差
    variance = sum((c['diff'] - avg_diff) ** 2 for c in comparison) / n
    std_diff = math.sqrt(variance)

    # 相关系数
    model_list = [c['model_score'] for c in comparison]
    teacher_list = [c['teacher_score'] for c in comparison]

    mean_model = sum(model_list) / n
    mean_teacher = sum(teacher_list) / n

    numerator = sum((model_list[i] - mean_model) * (teacher_list[i] - mean_teacher) for i in range(n))
    denom_model = sum((model_list[i] - mean_model) ** 2 for i in range(n))
    denom_teacher = sum((teacher_list[i] - mean_teacher) ** 2 for i in range(n))

    if denom_model == 0 or denom_teacher == 0:
        correlation = 0
    else:
        correlation = numerator / math.sqrt(denom_model * denom_teacher)

    # 误差分布
    error_distribution = {
        '完全一致(差值=0)': sum(1 for c in comparison if c['diff'] == 0),
        '差值±1': sum(1 for c in comparison if abs(c['diff']) == 1),
        '差值±2': sum(1 for c in comparison if abs(c['diff']) == 2),
        '差值±3-5': sum(1 for c in comparison if 3 <= abs(c['diff']) <= 5),
        '差值±6+': sum(1 for c in comparison if abs(c['diff']) >= 6)
    }

    # 准确率（误差≤2分）
    accuracy_2 = sum(1 for c in comparison if c['abs_diff'] <= 2) / n * 100
    accuracy_1 = sum(1 for c in comparison if c['abs_diff'] <= 1) / n * 100

    # 按分数段分析
    score_ranges = {
        '0-5分': [],
        '6-10分': [],
        '11-15分': [],
        '16-20分': [],
        '21分以上': []
    }

    for c in comparison:
        teacher_score = c['teacher_score']
        if teacher_score <= 5:
            score_ranges['0-5分'].append(c)
        elif teacher_score <= 10:
            score_ranges['6-10分'].append(c)
        elif teacher_score <= 15:
            score_ranges['11-15分'].append(c)
        elif teacher_score <= 20:
            score_ranges['16-20分'].append(c)
        else:
            score_ranges['21分以上'].append(c)

    # 最大误差
    max_diff = max(comparison, key=lambda x: x['abs_diff'])

    # 零分统计
    model_zeros = sum(1 for c in comparison if c['model_score'] == 0)
    teacher_zeros = sum(1 for c in comparison if c['teacher_score'] == 0)

    # 维度评分统计
    dimension_stats = {}
    if dimension_comparison:
        # 按维度名称分组
        for dim_name in set(d['dimension_name'] for d in dimension_comparison):
            dim_data = [d for d in dimension_comparison if d['dimension_name'] == dim_name]
            if dim_data:
                dim_scores = [d['model_dim_score'] for d in dim_data]
                dimension_stats[dim_name] = {
                    'count': len(dim_data),
                    'avg_score': sum(dim_scores) / len(dim_scores),
                    'min_score': min(dim_scores),
                    'max_score': max(dim_scores),
                    'score_distribution': {
                        str(i): sum(1 for s in dim_scores if s == i)
                        for i in range(6)  # 假设评分范围0-5
                    }
                }

    return {
        'comparison': comparison,
        'dimension_comparison': dimension_comparison,
        'stats': {
            'total_compared': n,
            'avg_model': avg_model,
            'avg_teacher': avg_teacher,
            'avg_diff': avg_diff,
            'avg_abs_diff': avg_abs_diff,
            'std_diff': std_diff,
            'correlation': correlation,
            'accuracy_2': accuracy_2,
            'accuracy_1': accuracy_1,
            'error_distribution': error_distribution,
            'max_diff': max_diff,
            'score_ranges': score_ranges,
            'model_zeros': model_zeros,
            'teacher_zeros': teacher_zeros,
            'dimension_stats': dimension_stats
        },
        'failed_students': failed_students,
        'teacher_stats': model_data
    }

def generate_html_report(analysis):
    """生成HTML报告"""

    stats = analysis['stats']

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>模型评分效果分析报告</title>
    <style>
        body {{
            font-family: 'Microsoft YaHei', Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }}
        .container {{
            max-width: 1400px;
            margin: 0 auto;
            background-color: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }}
        h1 {{
            color: #2c3e50;
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 15px;
            border-bottom: 3px solid #3498db;
        }}
        h2 {{
            color: #34495e;
            margin-top: 30px;
            margin-bottom: 15px;
            padding-left: 10px;
            border-left: 4px solid #3498db;
        }}
        .summary-box {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }}
        .stat-card {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
        }}
        .stat-card h3 {{
            margin: 0 0 10px 0;
            font-size: 14px;
            opacity: 0.9;
        }}
        .stat-card .value {{
            font-size: 28px;
            font-weight: bold;
            margin: 5px 0;
        }}
        .stat-card .unit {{
            font-size: 12px;
            opacity: 0.8;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            background-color: white;
        }}
        th, td {{
            padding: 12px;
            text-align: center;
            border: 1px solid #ddd;
        }}
        th {{
            background-color: #3498db;
            color: white;
            font-weight: bold;
        }}
        tr:nth-child(even) {{
            background-color: #f8f9fa;
        }}
        tr:hover {{
            background-color: #e8f4f8;
        }}
        .diff-positive {{
            color: #e74c3c;
            font-weight: bold;
        }}
        .diff-negative {{
            color: #27ae60;
            font-weight: bold;
        }}
        .diff-zero {{
            color: #34495e;
            font-weight: bold;
        }}
        .badge {{
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
        }}
        .badge-success {{
            background-color: #d4edda;
            color: #155724;
        }}
        .badge-warning {{
            background-color: #fff3cd;
            color: #856404;
        }}
        .badge-danger {{
            background-color: #f8d7da;
            color: #721c24;
        }}
        .chart-box {{
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }}
        .range-section {{
            margin: 30px 0;
            padding: 20px;
            background-color: #f8f9fa;
            border-radius: 8px;
        }}
        .range-section h3 {{
            color: #2c3e50;
            margin-top: 0;
        }}
        .footer {{
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #ecf0f1;
            text-align: center;
            color: #7f8c8d;
            font-size: 14px;
        }}
        .image-preview {{
            width: 60px;
            height: 80px;
            object-fit: cover;
            border: 1px solid #ddd;
            border-radius: 4px;
            cursor: pointer;
            transition: transform 0.2s;
        }}
        .image-preview:hover {{
            transform: scale(1.1);
        }}
        .toc {{
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }}
        .toc h3 {{
            margin-top: 0;
            color: #2c3e50;
        }}
        .image-modal {{
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.9);
        }}
        .modal-content {{
            margin: 5% auto;
            display: block;
            width: 80%;
            max-width: 800px;
        }}
        .close-modal {{
            position: absolute;
            top: 15px;
            right: 35px;
            color: #f1f1f1;
            font-size: 40px;
            font-weight: bold;
            cursor: pointer;
        }}
        .close-modal:hover {{
            color: #3498db;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🎯 模型评分效果分析报告</h1>

        <!-- 图片模态框 -->
        <div id="imageModal" class="image-modal">
            <span class="close-modal">&times;</span>
            <img class="modal-content" id="modalImage">
        </div>

        <h2>📊 总体统计</h2>
        <div class="summary-box">
            <div class="stat-card">
                <h3>对比样本数</h3>
                <div class="value">{stats['total_compared']}</div>
                <div class="unit">份试卷</div>
            </div>
            <div class="stat-card">
                <h3>模型平均分</h3>
                <div class="value">{stats['avg_model']:.2f}</div>
                <div class="unit">分</div>
            </div>
            <div class="stat-card">
                <h3>老师平均分</h3>
                <div class="value">{stats['avg_teacher']:.2f}</div>
                <div class="unit">分</div>
            </div>
            <div class="stat-card">
                <h3>平均误差</h3>
                <div class="value">{stats['avg_diff']:+.2f}</div>
                <div class="unit">分</div>
            </div>
            <div class="stat-card">
                <h3>平均绝对误差</h3>
                <div class="value">{stats['avg_abs_diff']:.2f}</div>
                <div class="unit">分</div>
            </div>
            <div class="stat-card">
                <h3>标准差</h3>
                <div class="value">{stats['std_diff']:.2f}</div>
                <div class="unit">分</div>
            </div>
            <div class="stat-card">
                <h3>相关系数</h3>
                <div class="value">{stats['correlation']:.3f}</div>
                <div class="unit">r值</div>
            </div>
            <div class="stat-card">
                <h3>准确率(±2分)</h3>
                <div class="value">{stats['accuracy_2']:.1f}%</div>
                <div class="unit">{sum(1 for c in analysis['comparison'] if c['abs_diff'] <= 2)}/{stats['total_compared']}</div>
            </div>
        </div>

        <h2>📈 误差分布</h2>
        <table>
            <thead>
                <tr>
                    <th>误差范围</th>
                    <th>数量</th>
                    <th>占比</th>
                </tr>
            </thead>
            <tbody>"""

    for category, count in stats['error_distribution'].items():
        percentage = count / stats['total_compared'] * 100
        html += f"""
                <tr>
                    <td>{category}</td>
                    <td>{count}</td>
                    <td>{percentage:.1f}%</td>
                </tr>"""

    html += f"""
            </tbody>
        </table>

        <h2>🎯 分数段分析</h2>"""

    for range_name, students in stats['score_ranges'].items():
        if students:
            range_avg_model = sum(s['model_score'] for s in students) / len(students)
            range_avg_teacher = sum(s['teacher_score'] for s in students) / len(students)
            range_avg_diff = sum(s['diff'] for s in students) / len(students)
            range_avg_abs = sum(s['abs_diff'] for s in students) / len(students)
            range_accuracy = sum(1 for s in students if s['abs_diff'] <= 2) / len(students) * 100

            html += f"""
        <div class="range-section">
            <h3>{range_name} - {len(students)}份试卷 (准确率: {range_accuracy:.1f}%)</h3>
            <table>
                <thead>
                    <tr>
                        <th>模型平均分</th>
                        <th>老师平均分</th>
                        <th>平均误差</th>
                        <th>平均绝对误差</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>{range_avg_model:.2f}</td>
                        <td>{range_avg_teacher:.2f}</td>
                        <td>{range_avg_diff:+.2f}</td>
                        <td>{range_avg_abs:.2f}</td>
                    </tr>
                </tbody>
            </table>
        </div>"""

    html += f"""
        <h2>⚠️ 极值分析</h2>
        <div class="chart-box">
            <table>
                <thead>
                    <tr>
                        <th>指标</th>
                        <th>考生考号</th>
                        <th>模型分数</th>
                        <th>老师分数</th>
                        <th>误差</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>最大绝对误差</td>
                        <td>{stats['max_diff']['kaohao']}</td>
                        <td>{stats['max_diff']['model_score']}</td>
                        <td>{stats['max_diff']['teacher_score']}</td>
                        <td class="{'diff-positive' if stats['max_diff']['diff'] > 0 else 'diff-negative'}">{stats['max_diff']['diff']:+.0f}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <h2>🔍 零分情况统计</h2>
        <div class="chart-box">
            <table>
                <thead>
                    <tr>
                        <th>评分者</th>
                        <th>零分数量</th>
                        <th>占比</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>模型评分</td>
                        <td>{stats['model_zeros']}</td>
                        <td>{stats['model_zeros']/stats['total_compared']*100:.1f}%</td>
                    </tr>
                    <tr>
                        <td>老师评分</td>
                        <td>{stats['teacher_zeros']}</td>
                        <td>{stats['teacher_zeros']/stats['total_compared']*100:.1f}%</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <h2>📊 维度评分分析</h2>
        <div class="chart-box">
            <table>
                <thead>
                    <tr>
                        <th>维度名称</th>
                        <th>样本数</th>
                        <th>平均分</th>
                        <th>最低分</th>
                        <th>最高分</th>
                    </tr>
                </thead>
                <tbody>"""

    # 添加维度评分统计
    for dim_name, dim_stat in stats.get('dimension_stats', {}).items():
        html += f"""
                    <tr>
                        <td>{dim_name}</td>
                        <td>{dim_stat['count']}</td>
                        <td>{dim_stat['avg_score']:.2f}</td>
                        <td>{dim_stat['min_score']}</td>
                        <td>{dim_stat['max_score']}</td>
                    </tr>"""

    html += f"""
                </tbody>
            </table>
        </div>

        <h2>📝 维度评分理由分析</h2>
        <div class="chart-box">
            <table>
                <thead>
                    <tr>
                        <th>维度名称</th>
                        <th>分数</th>
                        <th>典型评分理由</th>
                    </tr>
                </thead>
                <tbody>"""

    # 添加维度评分理由统计
    dimension_reasons = {}
    if 'dimension_comparison' in analysis:
        for dim_data in analysis['dimension_comparison']:
            dim_name = dim_data['dimension_name']
            dim_score = dim_data['model_dim_score']
            dim_reason = dim_data['dim_reason']

            if dim_name not in dimension_reasons:
                dimension_reasons[dim_name] = {}

            if dim_score not in dimension_reasons[dim_name]:
                dimension_reasons[dim_name][dim_score] = []

            # 只保留前100字符作为预览
            reason_preview = dim_reason[:100] + '...' if len(dim_reason) > 100 else dim_reason
            dimension_reasons[dim_name][dim_score].append(reason_preview)

    # 显示每个维度的评分理由
    for dim_name in sorted(dimension_reasons.keys()):
        for dim_score in sorted(dimension_reasons[dim_name].keys()):
            reasons = dimension_reasons[dim_name][dim_score]
            # 获取第一个作为典型理由
            typical_reason = reasons[0] if reasons else '无'

            html += f"""
                    <tr>
                        <td>{dim_name}</td>
                        <td>{dim_score}</td>
                        <td style="font-size:12px; max-width:400px;">{typical_reason}</td>
                    </tr>"""

    html += f"""
                </tbody>
            </table>
        </div>

        <h2>📋 详细对比表</h2>

        <!-- 添加目录链接 -->
        <div class="toc">
            <h3>快速导航</h3>
            <p>点击考号可跳转到对应图片 | <a href="#all-images">查看所有图片</a></p>
        </div>

        <table id="comparison-table">
            <thead>
                <tr>
                    <th>序号</th>
                    <th>考生考号</th>
                    <th>试卷图片</th>
                    <th>模型分数</th>
                    <th>老师分数</th>
                    <th>误差</th>
                    <th>误差级别</th>
                    <th>维度评分</th>
                </tr>
            </thead>
            <tbody>"""

    # 添加详细对比数据（只显示前100条以避免过长）
    for i, c in enumerate(analysis['comparison'][:100], 1):
        diff_class = 'diff-zero' if c['diff'] == 0 else ('diff-positive' if c['diff'] > 0 else 'diff-negative')
        abs_diff = c['abs_diff']
        if abs_diff == 0:
            badge_class = 'badge-success'
            badge_text = '完全一致'
        elif abs_diff <= 2:
            badge_class = 'badge-success'
            badge_text = '非常准确'
        elif abs_diff <= 5:
            badge_class = 'badge-warning'
            badge_text = '基本准确'
        else:
            badge_class = 'badge-danger'
            badge_text = '误差较大'

        # 生成图片路径（使用相对路径，便于独立发送）
        image_html = ''
        if c['image_name']:
            # 使用相对路径：./data/125531382/图片名
            image_path = f"./data/125531382/{c['image_name']}"
            image_html = f'<img src="{image_path}" class="image-preview" onclick="showImage(this.src)" alt="{c["image_name"]}">'
        else:
            image_html = '<span style="color: #999;">无图片</span>'

        # 处理维度评分显示
        dimensions_html = ''
        if c.get('score_dimension'):
            dim_list = []
            for dim in c['score_dimension'][:3]:  # 最多显示3个维度
                dim_name = dim.get('dimension_name', '')
                dim_score = dim.get('dimension_score', 0)
                dim_list.append(f"{dim_name}:{dim_score}")
            dimensions_html = '<br>'.join(dim_list)
            if len(c['score_dimension']) > 3:
                dimensions_html += f'<br><small style="color:#999;">+{len(c["score_dimension"])-3}个维度</small>'
        else:
            dimensions_html = '<span style="color:#999;">无维度评分</span>'

        html += f"""
                <tr id="student-{c['kaohao']}">
                    <td>{i}</td>
                    <td><a href="#student-{c['kaohao']}" onclick="showImageByStudent('{c['kaohao']}')">{c['kaohao']}</a></td>
                    <td>{image_html}</td>
                    <td>{c['model_score']}</td>
                    <td>{c['teacher_score']}</td>
                    <td class="{diff_class}">{c['diff']:+.0f}</td>
                    <td><span class="badge {badge_class}">{badge_text}</span></td>
                    <td style="font-size:12px;">{dimensions_html}</td>
                </tr>"""

    if len(analysis['comparison']) > 100:
        html += f"""
                <tr>
                    <td colspan="8" style="text-align: center; color: #7f8c8d;">
                        还有 {len(analysis['comparison']) - 100} 条记录未显示...
                    </td>
                </tr>"""

    html += f"""
            </tbody>
        </table>

        <h2>❌ 处理失败的试卷</h2>
        <table>
            <thead>
                <tr>
                    <th>考生考号</th>
                    <th>错误信息</th>
                </tr>
            </thead>
            <tbody>"""

    for failed in analysis['failed_students']:
        html += f"""
                <tr>
                    <td>{failed['student_id']}</td>
                    <td>{failed['error']}</td>
                </tr>"""

    html += f"""
            </tbody>
        </table>

        <h2 id="all-images">🖼️ 所有图片列表</h2>
        <div class="chart-box">
            <table>
                <thead>
                    <tr>
                        <th>考生考号</th>
                        <th>图片预览</th>
                        <th>图片名称</th>
                        <th>模型分数</th>
                        <th>老师分数</th>
                        <th>误差</th>
                    </tr>
                </thead>
                <tbody>"""

    # 添加所有图片的缩略图列表（只显示前50条）
    for c in analysis['comparison'][:50]:
        if c['image_name']:
            # 使用相对路径：./data/125531382/图片名
            image_path = f"./data/125531382/{c['image_name']}"
            html += f"""
                    <tr>
                        <td><a href="#student-{c['kaohao']}">{c['kaohao']}</a></td>
                        <td><img src="{image_path}" class="image-preview" onclick="showImage(this.src)" alt="{c['image_name']}"></td>
                        <td>{c['image_name']}</td>
                        <td>{c['model_score']}</td>
                        <td>{c['teacher_score']}</td>
                        <td class="{'diff-positive' if c['diff'] > 0 else 'diff-negative' if c['diff'] < 0 else 'diff-zero'}">{c['diff']:+.0f}</td>
                    </tr>"""

    html += f"""
                </tbody>
            </table>
        </div>

        <div class="footer">
            <p>📅 报告生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
            <p>📁 数据来源:</p>
            <p>&nbsp;&nbsp;&nbsp;&nbsp;• 模型评分: batch_results.json</p>
            <p>&nbsp;&nbsp;&nbsp;&nbsp;• 老师评分: 125531382.json</p>
            <p>📊 有效样本: {stats['total_compared']} / {analysis['teacher_stats']['total']} (成功率: {analysis['teacher_stats']['success_rate']})</p>
        </div>
    </div>

    <script>
        // 图片模态框功能
        const modal = document.getElementById('imageModal');
        const modalImg = document.getElementById('modalImage');
        const closeBtn = document.querySelector('.close-modal');

        function showImage(src) {{
            modal.style.display = 'block';
            modalImg.src = src;
        }}

        function showImageByStudent(studentId) {{
            // 找到该学生的图片并显示
            const row = document.querySelector(`#student-${{studentId}}`);
            if (row) {{
                const img = row.querySelector('img');
                if (img && img.src) {{
                    showImage(img.src);
                }}
            }}
        }}

        closeBtn.onclick = function() {{
            modal.style.display = 'none';
        }}

        // 点击模态框背景关闭
        window.onclick = function(event) {{
            if (event.target == modal) {{
                modal.style.display = 'none';
            }}
        }}

        // ESC键关闭模态框
        document.addEventListener('keydown', function(event) {{
            if (event.key === 'Escape') {{
                modal.style.display = 'none';
            }}
        }});
    </script>
</body>
</html>"""

    return html

if __name__ == '__main__':
    print("正在分析数据...")
    analysis = analyze_scores()

    if analysis is None:
        print("❌ 无有效数据进行对比！")
    else:
        print(f"✓ 共对比 {analysis['stats']['total_compared']} 份试卷")
        print(f"✓ 平均绝对误差: {analysis['stats']['avg_abs_diff']:.2f}分")
        print(f"✓ 相关系数: {analysis['stats']['correlation']:.3f}")
        print(f"✓ 准确率(±2分): {analysis['stats']['accuracy_2']:.1f}%")

        html_report = generate_html_report(analysis)

        output_path = '/home/wangdi5/en-essay-correction/score_comparison_report.html'
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html_report)

        print(f"\n✅ 报告已生成: {output_path}")
