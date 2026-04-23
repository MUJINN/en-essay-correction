// 主JavaScript文件 - 英语作文精批系统

// DOM元素
const essayForm = document.getElementById('essayForm');
const resultSection = document.getElementById('resultSection');
const resultContent = document.getElementById('resultContent');
const loadingOverlay = document.getElementById('loadingOverlay');
const submitBtn = document.getElementById('submitBtn');
const loadExampleBtn = document.getElementById('loadExampleBtn');
const copyResultBtn = document.getElementById('copyResultBtn');

// 加载示例数据
loadExampleBtn.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/load-example');
        const data = await response.json();
        
        if (data.success) {
            const example = data.data;
            document.getElementById('question_content').value = example.question_content || '';
            document.getElementById('student_answer').value = example.student_answer || '';
            document.getElementById('grade').value = example.grade || '';
            document.getElementById('total_score').value = example.total_score || '15';
            document.getElementById('subject_chs').value = example.subject_chs || '英语';
            document.getElementById('breakdown_type').value = example.breakdown_type || '';
            
            // 显示提示
            showNotification('示例数据已加载', 'success');
        }
    } catch (error) {
        showNotification('加载示例失败: ' + error.message, 'error');
    }
});

// 表单提交
essayForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // 检查当前输入模式
    const activeMode = document.querySelector('.mode-tab.active').dataset.mode;

    if (activeMode === 'image') {
        // 图片模式：检查是否有OCR结果
        const imageInput = document.getElementById('imageInput');
        const studentAnswer = document.getElementById('student_answer').value.trim();

        if (!imageInput.files[0]) {
            showNotification('请先上传图片', 'error');
            return;
        }

        if (!studentAnswer) {
            showNotification('请先点击OCR识别按钮进行文字识别', 'error');
            return;
        }
    } else {
        // 文本模式：检查必填字段
        const questionContent = document.getElementById('question_content').value.trim();
        const studentAnswer = document.getElementById('student_answer').value.trim();

        if (!questionContent || !studentAnswer) {
            showNotification('请填写题目内容和学生答案', 'error');
            return;
        }
    }

    // 收集表单数据（统一获取方式）
    const formData = {
        question_content: document.getElementById('question_content').value.trim(),
        student_answer: document.getElementById('student_answer').value.trim(),
        grade: document.getElementById('grade').value.trim(),
        total_score: document.getElementById('total_score').value.trim() || '15',
        subject_chs: document.getElementById('subject_chs').value.trim() || '英语',
        breakdown_type: document.getElementById('breakdown_type').value.trim(),
        task_key: 'web-demo-' + Date.now(),
        student_key: 'web-student-' + Date.now()
    };

    // ✅ 如果使用图片OCR模式，将OCR坐标数据一并发送给后端
    if (activeMode === 'image' && window.ocrResultData) {
        // 发送完整的OCRResponse对象结构，包括required字段
        formData.ocr_data = {
            success: true,  // OCR已成功识别
            boxes_data: window.ocrResultData.boxes_data || [],
            full_text: window.ocrResultData.text || '',  // 使用OCR识别的文本
            image_id: window.ocrResultData.image_id,
            created_at: new Date().toISOString()  // 使用当前时间
        };
        console.log('📦 添加OCR数据到表单:', formData.ocr_data);
    }

    // 在提交前保存表单数据到全局变量
    window.currentEssayData = formData;

    // 显示加载状态
    showLoading(true);
    submitBtn.disabled = true;
    submitBtn.querySelector('.btn-text').style.display = 'none';
    submitBtn.querySelector('.btn-loader').style.display = 'inline';

    try {
        const response = await fetch('/api/v2/correct', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (result.success) {
            // ✅ 先保存智能标注数据到全局变量,再调用displayResultWithHistory
            const activeMode = document.querySelector('.mode-tab.active').dataset.mode;
            const intelligentAnnotation = result.data.intelligent_annotation || result.data.outputs?.intelligent_annotation || null;

            // 保存智能标注数据到全局变量，供弹窗使用
            if (intelligentAnnotation) {
                window.intelligentAnnotationData = intelligentAnnotation;

                // ✅ 添加调试日志
                console.log('📝 批改成功，智能标注数据检查:');
                console.log('  - 输入模式:', activeMode);
                console.log('  - result.data.intelligent_annotation:', result.data.intelligent_annotation);
                console.log('  - result.data.outputs?.intelligent_annotation:', result.data.outputs?.intelligent_annotation);
                console.log('  - window.intelligentAnnotationData:', window.intelligentAnnotationData);

                // ✅ 添加持续监控，每秒检查一次智能标注数据是否被清空
                let checkCount = 0;
                const monitorInterval = setInterval(() => {
                    checkCount++;
                    console.log(`🔍 [监控] ${checkCount}s 后检查 window.intelligentAnnotationData:`, window.intelligentAnnotationData);
                    if (checkCount >= 10) {  // 监控10秒
                        clearInterval(monitorInterval);
                        console.log('🛑 停止监控');
                    }
                }, 1000);
            }

            // 传递表单数据和结果，确保window.currentEssayData始终有值
            const essayData = window.currentEssayData || formData;
            displayResultWithHistory(essayData, result.data);

            // 如果是图片OCR模式，显示智能标注（需要OCR坐标）
            if (intelligentAnnotation) {
                if (activeMode === 'image' && window.ocrResultData && window.ocrResultData.boxes_data.length > 0) {
                    setTimeout(() => {
                        showResultAnnotation(window.ocrResultData.boxes_data, window.intelligentAnnotationData);
                        showNotification('批改完成！智能标注已显示在批改结果中', 'success');
                    }, 500);
                } else {
                    showNotification('批改完成！智能标注数据已准备', 'success');
                }
            } else {
                showNotification('批改完成！', 'success');
            }
        } else {
            showNotification('批改失败: ' + (result.error || '未知错误'), 'error');
        }
    } catch (error) {
        showNotification('请求失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
        submitBtn.disabled = false;
        submitBtn.querySelector('.btn-text').style.display = 'inline';
        submitBtn.querySelector('.btn-loader').style.display = 'none';
        // 清除临时数据
        window.currentEssayData = null;
    }
});

// 显示结果 - 支持新的dify工作流输出格式
function displayResult(data) {
    const outputs = data.outputs || {};

    let html = '';

    // 统计信息
    // html += '<div class="stats">';
    // if (data.elapsed_time) {
    //     html += `<div class="stat-item">
    //         <div class="stat-label">执行时间</div>
    //         <div class="stat-value">${data.elapsed_time.toFixed(2)}s</div>
    //     </div>`;
    // }
    // if (data.total_tokens !== undefined && data.total_tokens > 0) {
    //     html += `<div class="stat-item">
    //         <div class="stat-label">消耗Token</div>
    //         <div class="stat-value">${data.total_tokens}</div>
    //     </div>`;
    // }
    html += '</div>';

    // 总分
    if (outputs.score !== undefined) {
        html += `<div class="result-item">
            <h3>🎯 总分</h3>
            <div class="score">${outputs.score}分</div>
        </div>`;
    }

    // 评分维度
    if (outputs.score_dimension && Array.isArray(outputs.score_dimension)) {
        html += `<div class="result-item">
            <h3>📊 评分维度</h3>`;
        outputs.score_dimension.forEach(dim => {
            html += `<div class="dimension-item">
                <div>
                    <div class="dimension-name">${escapeHtml(dim.dimension_name || dim.name || '')}</div>
                    ${dim.dimension_reason || dim.reason ? `<div class="dimension-reason">${escapeHtml(dim.dimension_reason || dim.reason)}</div>` : ''}
                </div>
                <div class="dimension-score">${dim.dimension_score || dim.score || 0}分</div>
            </div>`;
        });
        html += `</div>`;
    }

    // 最强维度和需要改进的维度
    if (outputs.strongest_dimension || outputs.to_improve_dimension) {
        html += `<div class="result-item">
            <h3>📈 亮点与不足</h3>
            <div class="content">`;
        if (outputs.strongest_dimension) {
            html += `<p><strong>最强维度：</strong>${escapeHtml(outputs.strongest_dimension)}</p>`;
        }
        if (outputs.to_improve_dimension) {
            html += `<p><strong>需要改进：</strong>${escapeHtml(outputs.to_improve_dimension)}</p>`;
        }
        html += `</div></div>`;
    }

    // 作文基本信息
    if (outputs.composition_basic_info) {
        const info = outputs.composition_basic_info;
        html += `<div class="result-item">
            <h3>📝 作文基本信息</h3>
            <div class="content">`;
        if (info.word_count) {
            html += `<p><strong>字数统计：</strong>${escapeHtml(info.word_count)} 词</p>`;
        }
        if (info.grade) {
            html += `<p><strong>作文等级：</strong>${escapeHtml(info.grade)}</p>`;
        }
        html += `</div></div>`;
    }

    // 作文整体评价
    if (outputs.composition_overall_evaluation) {
        const overallEval = outputs.composition_overall_evaluation;
        html += `<div class="result-item">
            <h3>⭐ 作文整体评价</h3>`;

        if (overallEval.advantages && Array.isArray(overallEval.advantages)) {
            html += `<div class="content">
                <h4>优点：</h4>
                <ul class="grammar-list">`;
            overallEval.advantages.forEach(adv => {
                html += `<li><strong>${escapeHtml(adv.advantage_name)}：</strong>${escapeHtml(adv.advantage_reason)}</li>`;
            });
            html += `</ul></div>`;
        }

        if (overallEval.overall_good_sentences && Array.isArray(overallEval.overall_good_sentences)) {
            html += `<div class="content">
                <h4>精彩句子：</h4>
                <ul class="grammar-list">`;
            overallEval.overall_good_sentences.forEach(sent => {
                html += `<li><em>"${escapeHtml(sent.text)}"</em><br><small>${escapeHtml(sent.reason)}</small></li>`;
            });
            html += `</ul></div>`;
        }

        if (overallEval.improvement_list && Array.isArray(overallEval.improvement_list)) {
            html += `<div class="content">
                <h4>改进建议：</h4>
                <ul class="grammar-list">`;
            overallEval.improvement_list.forEach(imp => {
                html += `<li>
                    <strong>${escapeHtml(imp.improvement_name)}：</strong><br>
                    <div class="improvement-item">
                        <p><strong>原文：</strong>"${escapeHtml(imp.original_sentence)}"</p>
                        <p><strong>改进：</strong>"${escapeHtml(imp.improvement_sentence)}"</p>
                        <p><small>${escapeHtml(imp.improvement_reason)}</small></p>
                    </div>
                </li>`;
            });
            html += `</ul></div>`;
        }

        html += `</div>`;
    }

    // 智能标注
    if (outputs.intelligent_annotation) {
        const anno = outputs.intelligent_annotation;
        html += `<div class="result-item">
            <h3>🏷️ 智能标注</h3>
            <div class="content">`;

        if (anno.highlight_count) {
            html += `<p><strong>高亮句子数：</strong>${escapeHtml(anno.highlight_count)}</p>`;
        }

        if (anno.nice_sentence && Array.isArray(anno.nice_sentence)) {
            html += `<h4>精彩表达：</h4><ul class="grammar-list">`;
            anno.nice_sentence.forEach(sent => {
                html += `<li><em>"${escapeHtml(sent.text)}"</em><br><small>${escapeHtml(sent.nice_reason)}</small></li>`;
            });
            html += `</ul>`;
        }

        if (anno.good_sentence && Array.isArray(anno.good_sentence)) {
            html += `<h4>良好表达：</h4><ul class="grammar-list">`;
            anno.good_sentence.forEach(sent => {
                html += `<li><em>"${escapeHtml(sent.text)}"</em><br><small>${escapeHtml(sent.good_reason)}</small></li>`;
            });
            html += `</ul>`;
        }

        if (anno.improve_sentence && Array.isArray(anno.improve_sentence)) {
            html += `<h4>待改进表达：</h4><ul class="grammar-list">`;
            anno.improve_sentence.forEach(sent => {
                html += `<li><em>"${escapeHtml(sent.text)}"</em><br><small>${escapeHtml(sent.improve_reason)}</small></li>`;
            });
            html += `</ul>`;
        }

        if (anno.improve_count) {
            html += `<p><strong>待改进数量：</strong>${escapeHtml(anno.improve_count)}</p>`;
        }

        html += `</div></div>`;
    }

    // 写作能力提升建议
    if (outputs.writing_ability_enhancement) {
        const ability = outputs.writing_ability_enhancement;
        html += `<div class="result-item">
            <h3>💡 写作能力提升建议</h3>`;

        if (ability.problem_focus && Array.isArray(ability.problem_focus)) {
            html += `<div class="content">
                <h4>问题聚焦：</h4>
                <ul class="grammar-list">`;
            ability.problem_focus.forEach(prob => {
                html += `<li>
                    <strong>${escapeHtml(prob.title)}：</strong>
                    <p>${escapeHtml(prob.problem)}</p>
                </li>`;
            });
            html += `</ul></div>`;
        }

        if (ability.writing_suggestions && Array.isArray(ability.writing_suggestions)) {
            html += `<div class="content">
                <h4>写作建议：</h4>
                <ul class="grammar-list">`;
            ability.writing_suggestions.forEach(sugg => {
                html += `<li>
                    <strong>${escapeHtml(sugg.title)}：</strong>
                    <p>${escapeHtml(sugg.suggestion)}</p>
                </li>`;
            });
            html += `</ul></div>`;
        }

        html += `</div>`;
    }

    // 全文润色
    if (outputs.full_text_polishing && Array.isArray(outputs.full_text_polishing)) {
        html += `<div class="result-item">
            <h3>✨ 全文润色</h3>`;
        outputs.full_text_polishing.forEach(polish => {
            html += `<div class="content">
                <p>${escapeHtml(polish.content)}</p>
            </div>`;
        });
        html += `</div>`;
    }

    // AI老师消息
    if (outputs.ai_teacher_message) {
        const msg = outputs.ai_teacher_message;
        html += `<div class="result-item">
            <h3>👨‍🏫 AI老师寄语</h3>
            <div class="content">`;

        if (msg.message && Array.isArray(msg.message)) {
            msg.message.forEach(m => {
                html += `<div class="ai-message-item">
                    <p><strong>${m.num}.</strong> ${escapeHtml(m.content)}</p>
                </div>`;
            });
        }

        if (msg.signature) {
            html += `<p class="ai-signature">—— ${escapeHtml(msg.signature)}</p>`;
        }

        html += `</div></div>`;
    }

    // 推荐书籍
    if (outputs.recommended_books && Array.isArray(outputs.recommended_books)) {
        html += `<div class="result-item">
            <h3>📚 推荐阅读</h3>
            <div class="content">
                <ul class="grammar-list">`;
        outputs.recommended_books.forEach(book => {
            html += `<li>
                <strong>《${escapeHtml(book.name)}》</strong> - ${escapeHtml(book.author)}<br>
                <small>${escapeHtml(book.reason)}</small>
            </li>`;
        });
        html += `</ul></div></div>`;
    }

    // 总结评价
    if (outputs.summary_comment) {
        html += `<div class="result-item">
            <h3>📝 总结评价</h3>
            <div class="content">${escapeHtml(outputs.summary_comment)}</div>
        </div>`;
    }

    // 整体评语（兼容旧格式）
    if (outputs.comment && !outputs.summary_comment) {
        html += `<div class="result-item">
            <h3>💬 整体评语</h3>
            <div class="content">${escapeHtml(outputs.comment)}</div>
        </div>`;
    }

    // 语法诊断（兼容旧格式）
    if (outputs.grammar_diagnosis && typeof outputs.grammar_diagnosis === 'string') {
        html += `<div class="result-item">
            <h3>🔍 语法诊断</h3>
            <div class="content">${escapeHtml(outputs.grammar_diagnosis)}</div>
        </div>`;
    }

    // 润色后的文章（兼容旧格式）
    if (outputs.polish && (!outputs.full_text_polishing || outputs.full_text_polishing.length === 0)) {
        html += `<div class="result-item">
            <h3>✨ 润色后的文章</h3>
            <div class="content">${escapeHtml(outputs.polish)}</div>
        </div>`;
    }

    // 改进建议（兼容旧格式）
    if (outputs.suggestions && (!outputs.writing_ability_enhancement || !outputs.writing_ability_enhancement.writing_suggestions)) {
        html += `<div class="result-item">
            <h3>💡 改进建议</h3>
            <div class="content">${escapeHtml(outputs.suggestions)}</div>
        </div>`;
    }

    // 参考范文（兼容旧格式）
    if (outputs.model_essay && (!outputs.recommended_books || outputs.recommended_books.length === 0)) {
        html += `<div class="result-item">
            <h3>📖 参考范文</h3>
            <div class="content">${escapeHtml(outputs.model_essay)}</div>
        </div>`;
    }

    resultContent.innerHTML = html;
    resultSection.style.display = 'block';

    // 滚动到结果区域
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 复制结果
copyResultBtn.addEventListener('click', () => {
    const text = resultContent.innerText;
    navigator.clipboard.writeText(text).then(() => {
        showNotification('结果已复制到剪贴板', 'success');
    }).catch(err => {
        showNotification('复制失败: ' + err.message, 'error');
    });
});

// 显示/隐藏加载动画
function showLoading(show) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 显示通知
function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;

    // 添加图标
    const iconMap = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle',
        warning: 'fa-exclamation-triangle'
    };
    const icon = iconMap[type] || iconMap.info;

    notification.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
    `;

    document.body.appendChild(notification);

    // 添加移除按钮
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.style.cssText = `
        position: absolute;
        top: 8px;
        right: 8px;
        background: none;
        border: none;
        color: rgba(0, 0, 0, 0.3);
        cursor: pointer;
        font-size: 14px;
        padding: 4px;
        transition: color 0.3s;
    `;
    closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.color = 'rgba(0, 0, 0, 0.6)';
    });
    closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.color = 'rgba(0, 0, 0, 0.3)';
    });
    closeBtn.addEventListener('click', () => {
        notification.style.animation = 'slideOutRight 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 400);
    });
    notification.appendChild(closeBtn);

    // 5秒后自动移除
    setTimeout(() => {
        if (document.body.contains(notification)) {
            notification.style.animation = 'slideOutRight 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 400);
        }
    }, 5000);
}

// 添加CSS动画
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// 添加键盘快捷键支持
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter 快速提交
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (document.activeElement.tagName === 'TEXTAREA') {
            e.preventDefault();
            // 检查提交按钮是否已禁用，避免重复提交
            const submitBtn = document.getElementById('submitBtn');
            if (!submitBtn.disabled) {
                essayForm.dispatchEvent(new Event('submit'));
            }
        }
    }
});

// 添加输入框聚焦动画
const inputs = document.querySelectorAll('input, textarea');
inputs.forEach(input => {
    input.addEventListener('focus', function() {
        this.parentElement.classList.add('focused');
    });

    input.addEventListener('blur', function() {
        this.parentElement.classList.remove('focused');
        if (this.value.trim()) {
            this.parentElement.classList.add('has-value');
        } else {
            this.parentElement.classList.remove('has-value');
        }
    });

    // 检查初始值
    if (input.value.trim()) {
        input.parentElement.classList.add('has-value');
    }
});

// 添加表单验证实时反馈
essayForm.addEventListener('input', (e) => {
    const questionContent = document.getElementById('question_content');
    const studentAnswer = document.getElementById('student_answer');

    if (e.target === questionContent || e.target === studentAnswer) {
        if (e.target.value.trim()) {
            e.target.classList.remove('error');
        }
    }
});

// 添加平滑滚动到顶部功能
function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// 添加结果展开/收起动画
function animateResultExpansion() {
    const resultItems = document.querySelectorAll('.result-item');
    resultItems.forEach((item, index) => {
        item.style.opacity = '0';
        item.style.transform = 'translateY(20px)';

        setTimeout(() => {
            item.style.transition = 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
            item.style.opacity = '1';
            item.style.transform = 'translateY(0)';
        }, index * 100);
    });
}

// 修改显示结果函数以包含动画
const originalDisplayResult = displayResult;
displayResult = function(data) {
    originalDisplayResult(data);
    // 延迟执行动画，确保DOM已更新
    setTimeout(() => {
        animateResultExpansion();
    }, 100);
};

// 添加加载状态的骨架屏效果
function showSkeletonLoader() {
    resultContent.innerHTML = `
        <div class="skeleton-loader">
            <div class="skeleton-item">
                <div class="skeleton-header"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line short"></div>
            </div>
            <div class="skeleton-item">
                <div class="skeleton-header"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line"></div>
            </div>
        </div>
    `;
}

// 添加键盘焦点指示
document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        document.body.classList.add('keyboard-nav');
    }
});

document.addEventListener('mousedown', () => {
    document.body.classList.remove('keyboard-nav');
});

// 在表单提交时显示骨架屏
const originalShowLoading = showLoading;
showLoading = function(show) {
    if (show) {
        originalShowLoading(true);
        // 显示骨架屏
        resultContent.innerHTML = `
            <div class="skeleton-loader">
                ${Array(4).fill(0).map(() => `
                    <div class="skeleton-item">
                        <div class="skeleton-header"></div>
                        <div class="skeleton-line"></div>
                        <div class="skeleton-line"></div>
                        <div class="skeleton-line short"></div>
                    </div>
                `).join('')}
            </div>
        `;
    } else {
        originalShowLoading(false);
    }
};

// ========== 页面初始化 ==========

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 页面加载完成');
});


// ========== 新增功能：页面导航和历史记录 ==========

// 导航功能
const navBtns = document.querySelectorAll('.nav-btn');
const pages = document.querySelectorAll('.page');

// 页面切换
navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetPage = btn.dataset.page;
        console.log('🔄 导航按钮被点击，目标页面:', targetPage);

        // 更新按钮状态
        navBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // 切换页面
        pages.forEach(p => p.classList.remove('active'));
        const targetPageElement = document.getElementById(`page-${targetPage}`);
        if (targetPageElement) {
            targetPageElement.classList.add('active');
            console.log('✅ 页面切换完成:', targetPage);

            // 立即验证页面切换结果
            console.log('📋 立即验证页面状态:');
            pages.forEach(page => {
                const isActive = page.classList.contains('active');
                const display = window.getComputedStyle(page).display;
                console.log(`   ${page.id}: active=${isActive}, display=${display}`);
                if (page.id === 'page-history' && isActive) {
                }
            });
        } else {
            console.error('❌ 目标页面元素不存在:', `page-${targetPage}`);
        }

        // 加载页面数据
        console.log('📤 调用 loadPageData:', targetPage);
        loadPageData(targetPage);

        // 额外的页面切换验证
        if (targetPage === 'history') {
            setTimeout(() => {
                const historyPage = document.getElementById('page-history');
                if (historyPage && !historyPage.classList.contains('active')) {
                    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
                    historyPage.classList.add('active');
                }
            }, 200);
        }
    });
});

// 批量处理选项卡
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;

        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        tabContents.forEach(c => c.classList.remove('active'));
        document.getElementById(`tab-${targetTab}`).classList.add('active');
    });
});

// ========== 历史记录管理 ==========

// 历史记录存储键名
const HISTORY_KEY = 'essay_correction_history';

// 获取历史记录
function getHistory() {
    try {
        const history = localStorage.getItem(HISTORY_KEY);
        return history ? JSON.parse(history) : [];
    } catch (e) {
        console.error('读取历史记录失败:', e);
        return [];
    }
}

// 保存历史记录
function saveHistory(history) {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
        console.error('保存历史记录失败:', e);
        showNotification('保存历史记录失败', 'error');
    }
}

// 添加历史记录
function addToHistory(data) {
    const history = getHistory();
    const newRecord = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        ...data
    };
    history.unshift(newRecord);

    // 限制最多保存100条记录
    if (history.length > 100) {
        history.splice(100);
    }

    saveHistory(history);
    console.log('✅ 历史记录已保存:', newRecord);
    console.log('📊 当前历史记录总数:', history.length);

    // 如果当前在历史记录页面，自动刷新显示
    const activePage = document.querySelector('.page.active');
    if (activePage && activePage.id === 'page-history') {
        console.log('🔄 自动刷新历史记录页面...');
        renderHistory();
    }

    return newRecord;
}

// 删除历史记录
function deleteHistory(id) {
    const history = getHistory();
    const newHistory = history.filter(item => item.id !== id);
    saveHistory(newHistory);
}

// 清空历史记录
function clearHistory() {
    saveHistory([]);
}

// 渲染历史记录
function renderHistory(filters = {}) {
    console.log('🎨 renderHistory 被调用，筛选条件:', filters);
    const historyList = document.getElementById('historyList');

    if (!historyList) {
        console.error('❌ historyList 元素不存在！');
        return;
    }

    let history = getHistory();
    console.log('📊 读取到历史记录:', history.length, '条');

    // 应用筛选
    if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        history = history.filter(item =>
            (item.question_content && item.question_content.toLowerCase().includes(searchLower)) ||
            (item.student_answer && item.student_answer.toLowerCase().includes(searchLower))
        );
    }

    if (filters.grade) {
        history = history.filter(item => item.grade === filters.grade);
    }

    if (filters.scoreRange) {
        const [min, max] = filters.scoreRange.split('-').map(Number);
        history = history.filter(item => {
            const score = parseFloat(item.outputs?.score || 0);
            return score >= min && score <= max;
        });
    }

    if (filters.date) {
        const filterDate = new Date(filters.date).toDateString();
        history = history.filter(item => {
            const itemDate = new Date(item.timestamp).toDateString();
            return itemDate === filterDate;
        });
    }

    console.log('📊 筛选后历史记录:', history.length, '条');

    if (history.length === 0) {
        console.log('ℹ️ 没有历史记录，显示空状态');
        historyList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <h3>暂无历史记录</h3>
                <p>开始批改作文后，记录将显示在这里</p>
            </div>
        `;
        return;
    }

    console.log('✅ 开始渲染', history.length, '条记录');
    historyList.innerHTML = history.map(item => {
        const date = new Date(item.timestamp);
        const score = item.outputs?.score || 'N/A';
        const questionPreview = (item.question_content || '').substring(0, 50) + '...';

        return `
            <div class="history-card" data-id="${item.id}">
                <div class="history-card-header">
                    <div class="history-card-title">${escapeHtml(questionPreview)}</div>
                    <div class="history-card-score">${score}</div>
                </div>
                <div class="history-card-meta">
                    <span><i class="fas fa-calendar"></i> ${date.toLocaleDateString()}</span>
                    <span><i class="fas fa-user"></i> ${escapeHtml(item.grade || '未知')}</span>
                    <span><i class="fas fa-clock"></i> ${date.toLocaleTimeString()}</span>
                </div>
                <div class="history-card-preview">
                    ${escapeHtml(item.student_answer || '').substring(0, 100)}...
                </div>
                <div class="history-card-actions">
                    <button class="btn-icon" onclick="viewHistoryDetail('${item.id}')">
                        <i class="fas fa-eye"></i> 查看
                    </button>
                    <button class="btn-icon" onclick="reCorrectHistory('${item.id}')">
                        <i class="fas fa-redo"></i> 重新批改
                    </button>
                    <button class="btn-icon" onclick="deleteHistoryRecord('${item.id}')">
                        <i class="fas fa-trash"></i> 删除
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// 查看历史记录详情
// 恢复历史记录中的智能标注
function restoreIntelligentAnnotation(record) {
    console.log('🔄 开始恢复智能标注...', record.intelligent_annotation);

    // 检查智能标注数据是否存在
    if (!record.intelligent_annotation) {
        console.warn('⚠️ 历史记录中没有智能标注数据');
        console.log('⚠️ record 结构:', record);
        return;
    }

    // ✅ 支持多种数据结构的fallback
    let { annotationData, currentMode } = record.intelligent_annotation;

    // 如果annotationData为空,尝试从outputs中获取
    if (!annotationData && record.outputs?.intelligent_annotation) {
        console.log('⚠️ annotationData为空,尝试从outputs.intelligent_annotation获取');
        annotationData = record.outputs.intelligent_annotation;
    }

    // ✅ 添加调试日志
    console.log('📝 恢复智能标注详细数据:');
    console.log('  - record.intelligent_annotation:', record.intelligent_annotation);
    console.log('  - annotationData:', annotationData);
    console.log('  - currentMode:', currentMode);

    // 1. 恢复智能标注数据到全局变量（保存完整结构，兼容弹窗访问）
    window.intelligentAnnotationData = annotationData || {
        annotationData: annotationData,
        currentMode: currentMode || 'text-blocks'
    };
    currentAnnotationMode = currentMode || 'text-blocks';

    console.log('✅ 智能标注数据已恢复:', {
        hasAnnotationData: !!annotationData,
        currentMode: currentAnnotationMode
    });

    // 2. 恢复图片显示
    const resultBoxesImg = document.getElementById('resultBoxesImg');
    if (resultBoxesImg && record.image_data) {
        // 确保图片数据格式正确(包含data:image前缀)
        let imageData = record.image_data;
        if (!imageData.startsWith('data:image/')) {
            // 如果缺少前缀,添加默认前缀
            imageData = 'data:image/png;base64,' + imageData;
            console.log('⚠️ 图片数据缺少前缀,已自动添加');
        }
        resultBoxesImg.src = imageData;
        console.log('✅ OCR图片已加载');

        // 同时保存到全局变量
        window.currentOCRImageData = imageData;
    }

    // 3. 恢复OCR数据到全局变量（确保"查看原图"功能正常工作）
    // ✅ 支持多种数据来源: outputs.boxes_data 或 ocr_data.boxes_data
    const ocrBlocks = record.outputs?.boxes_data || record.ocr_data?.boxes_data || [];
    if (ocrBlocks.length > 0) {
        // 恢复全局OCR结果数据
        window.ocrResultData = {
            boxes_data: ocrBlocks,
            text: record.student_answer || ''  // 使用学生答案作为文本
        };
        console.log('✅ OCR数据已恢复到全局变量:', ocrBlocks.length, '个文本块');
        console.log('📍 OCR数据来源:', record.outputs?.boxes_data ? 'outputs.boxes_data' : 'ocr_data.boxes_data');
    } else {
        console.warn('⚠️ 未找到OCR坐标数据');
    }

    // 4. 恢复模式切换按钮状态
    setTimeout(() => {
        const modeBtns = document.querySelectorAll('.mode-btn');
        modeBtns.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.mode === currentAnnotationMode) {
                btn.classList.add('active');
            }
        });
        console.log('✅ 模式切换按钮状态已恢复');

        // 5. 恢复智能标注可视化
        // 注意：只要有标注数据就显示，不依赖于保存时的模式
        if (annotationData) {
            console.log('🔄 恢复智能标注可视化...');
            // 如果保存时是text-blocks模式，强制切换到intelligent-annotation
            if (currentAnnotationMode === 'text-blocks') {
                currentAnnotationMode = 'intelligent-annotation';
                console.log('🔄 强制切换到智能标注视图');
            }

            // ✅ 直接调用showResultAnnotation，让它自己处理图片加载等待
            console.log('✅ 调用showResultAnnotation显示智能标注');
            showResultAnnotation(ocrBlocks, annotationData);
        } else {
            console.warn('⚠️ annotationData 为空，无法恢复智能标注可视化');
        }
    }, 500);
}

window.viewHistoryDetail = function(id) {
    try {
        console.log('🔍 viewHistoryDetail 被调用，ID:', id);

        // 优先从本地历史记录中查找
        const history = getHistory();
        let record = history.find(item => item.id === id);
        console.log('📋 从本地历史找到记录:', !!record);

        // 如果本地没找到，尝试从服务器历史记录中查找
        if (!record && historyState.serverData) {
            const serverRecord = historyState.serverData.find(item =>
                item.record_id === id || item.filename === id
            );
            if (serverRecord) {
                console.log('✅ 从服务器历史找到记录,开始加载...');
                // 从服务器获取完整记录(返回JSON数据,不触发下载)
                downloadServerHistoryFile(serverRecord.filename, true).then(data => {
                    if (data) {
                        // 切换页面并显示结果
                        const pageBtn = document.querySelector('[data-page="correct"]');
                        if (pageBtn) pageBtn.click();

                        setTimeout(() => {
                            displayResult(data);
                            // 如果有OCR数据或智能标注数据,恢复智能标注
                            if (data.outputs?.boxes_data?.length > 0 || data.intelligent_annotation) {
                                restoreIntelligentAnnotation(data);
                            }
                            showNotification('已从服务器加载历史记录', 'success');
                        }, 300);
                    }
                }).catch(err => {
                    console.error('❌ 加载服务器记录失败:', err);
                    showNotification('加载记录失败: ' + err.message, 'error');
                });
                return;
            }
        }

        if (!record) {
            showNotification('未找到历史记录', 'error');
            return;
        }

        // 切换到批改页面并显示结果
        const pageBtn = document.querySelector('[data-page="correct"]');
        console.log('📄 找到页面按钮:', !!pageBtn);
        if (pageBtn) pageBtn.click();

        // 显示结果
        setTimeout(() => {
            console.log('📊 显示结果...');
            displayResult(record);
            console.log('✅ 恢复智能标注...');
            restoreIntelligentAnnotation(record);
            showNotification('已加载历史记录', 'success');
        }, 300);
    } catch (error) {
        console.error('❌ viewHistoryDetail 错误:', error);
        showNotification('加载历史记录失败: ' + error.message, 'error');
    }
};

// 重新批改历史记录
window.reCorrectHistory = function(id) {
    try {
        console.log('🔍 reCorrectHistory 被调用，ID:', id);

        // 优先从本地历史记录中查找
        const history = getHistory();
        let record = history.find(item => item.id === id);
        console.log('📋 从本地历史找到记录:', !!record);

        // 如果本地没找到，尝试从服务器历史记录中查找
        if (!record && historyState.serverData) {
            const serverRecord = historyState.serverData.find(item =>
                item.record_id === id || item.filename === id
            );
            if (serverRecord) {
                console.log('✅ 从服务器历史找到记录,开始加载...');
                // 从服务器获取完整记录(返回JSON数据,不触发下载)
                downloadServerHistoryFile(serverRecord.filename, true).then(data => {
                    if (data) {
                        // 切换页面并填充表单
                        const pageBtn = document.querySelector('[data-page="correct"]');
                        if (pageBtn) pageBtn.click();

                        setTimeout(() => {
                            console.log('📝 填充表单...');
                            document.getElementById('question_content').value = data.question_content || '';
                            document.getElementById('student_answer').value = data.student_answer || '';
                            document.getElementById('grade').value = data.grade || '';
                            document.getElementById('total_score').value = data.total_score || '15';
                            document.getElementById('subject_chs').value = data.subject_chs || '英语';
                            document.getElementById('breakdown_type').value = data.breakdown_type || '';

                            showNotification('已加载历史数据，点击开始批改', 'info');
                        }, 300);
                    }
                }).catch(err => {
                    console.error('❌ 加载服务器记录失败:', err);
                    showNotification('加载记录失败: ' + err.message, 'error');
                });
                return;
            }
        }

        if (!record) {
            showNotification('未找到历史记录', 'error');
            return;
        }

        // 切换到批改页面并填充表单
        const pageBtn = document.querySelector('[data-page="correct"]');
        console.log('📄 找到页面按钮:', !!pageBtn);
        if (pageBtn) pageBtn.click();

        setTimeout(() => {
            console.log('📝 填充表单...');
            document.getElementById('question_content').value = record.question_content || '';
            document.getElementById('student_answer').value = record.student_answer || '';
            document.getElementById('grade').value = record.grade || '';
            document.getElementById('total_score').value = record.total_score || '15';
            document.getElementById('subject_chs').value = record.subject_chs || '英语';
            document.getElementById('breakdown_type').value = record.breakdown_type || '';

            showNotification('已加载历史数据，点击开始批改', 'info');
        }, 300);
    } catch (error) {
        console.error('❌ reCorrectHistory 错误:', error);
        showNotification('加载历史数据失败: ' + error.message, 'error');
    }
};

// 删除历史记录
window.deleteHistoryRecord = function(id) {
    if (confirm('确定要删除这条记录吗？')) {
        deleteHistory(id);
        renderHistory(getCurrentFilters());
        showNotification('已删除记录', 'success');
    }
};

// 获取当前筛选条件
function getCurrentFilters() {
    return {
        search: document.getElementById('searchInput')?.value || '',
        grade: document.getElementById('gradeFilter')?.value || '',
        scoreRange: document.getElementById('scoreFilter')?.value || '',
        date: document.getElementById('dateFilter')?.value || ''
    };
}

// 筛选器事件
const searchInput = document.getElementById('searchInput');
const gradeFilter = document.getElementById('gradeFilter');
const scoreFilter = document.getElementById('scoreFilter');
const dateFilter = document.getElementById('dateFilter');

if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            renderHistory(getCurrentFilters());
        }, 300);
    });
}

[gradeFilter, scoreFilter, dateFilter].forEach(filter => {
    if (filter) {
        filter.addEventListener('change', () => {
            renderHistory(getCurrentFilters());
        });
    }
});

// 清空历史记录
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
        if (confirm('确定要清空所有历史记录吗？此操作不可恢复！')) {
            clearHistory();
            renderHistory();
            showNotification('已清空历史记录', 'success');
        }
    });
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 清除任何可能的调试样式
    const historyPage = document.getElementById('page-history');
    if (historyPage) {
        // 移除可能存在的调试样式
        const elements = historyPage.querySelectorAll('*');
        elements.forEach(el => {
            el.style.removeProperty('background');
            el.style.removeProperty('border');
            el.style.removeProperty('border-color');
            el.style.removeProperty('outline');
        });
    }

    // 强制重绘以解决渲染问题
    document.body.style.display = 'none';
    document.body.offsetHeight; // 触发重绘
    document.body.style.display = '';

    // 初始化历史记录按钮
    const viewHistoryViewerBtn = document.getElementById('viewHistoryViewerBtn');
    if (viewHistoryViewerBtn) {
        viewHistoryViewerBtn.addEventListener('click', () => {
            createHistoryViewer();
        });
    }

    // 确保页面容器正确渲染
    const pagesContainer = document.querySelector('.pages-container');
    if (pagesContainer) {
        pagesContainer.style.minHeight = (window.innerHeight - 200) + 'px';
    }
});

// 导出历史记录
const exportHistoryBtn = document.getElementById('exportHistoryBtn');
if (exportHistoryBtn) {
    exportHistoryBtn.addEventListener('click', () => {
        const history = getHistory();
        const dataStr = JSON.stringify(history, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `essay_history_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
        showNotification('历史记录已导出', 'success');
    });
}

// 导出报告
const exportReportBtn = document.getElementById('exportReportBtn');
if (exportReportBtn) {
    exportReportBtn.addEventListener('click', () => {
        const history = getHistory();
        const report = generateReport(history);
        const dataBlob = new Blob([report], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `essay_report_${new Date().toISOString().split('T')[0]}.html`;
        link.click();
        URL.revokeObjectURL(url);
        showNotification('报告已导出', 'success');
    });
}

// ========== 服务器端历史记录管理 ==========

// 从服务器加载历史记录文件列表 - 支持分页
async function loadServerHistoryList(page = 1, size = 10) {
    try {
        const response = await fetch(`/api/history/list?page=${page}&size=${size}`);
        const result = await response.json();

        if (result.success) {
            return {
                files: result.data.files || [],
                total: result.data.total || 0,
                page: result.data.page || page,
                size: result.data.size || size
            };
        } else {
            console.error('获取服务器历史记录失败:', result);
            return { files: [], total: 0, page: page, size: size };
        }
    } catch (error) {
        console.error('加载服务器历史记录列表失败:', error);
        return { files: [], total: 0, page: page, size: size };
    }
}

// 下载服务器端历史记录文件
async function downloadServerHistoryFile(filename, returnData = false) {
    try {
        const response = await fetch(`/api/history/download/${filename}`);
        if (!response.ok) {
            throw new Error('下载失败');
        }

        // 如果需要返回数据(用于查看),解析为JSON
        if (returnData) {
            const data = await response.json();
            return data;
        }

        // 否则触发下载
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);

        showNotification('文件下载成功', 'success');
    } catch (error) {
        showNotification('下载失败: ' + error.message, 'error');
        throw error; // 抛出错误以便调用者处理
    }
}

// 清空服务器端历史记录
async function clearServerHistory() {
    if (!confirm('确定要清空服务器端的所有历史记录吗？此操作不可恢复！')) {
        return;
    }

    try {
        const response = await fetch('/api/history/clear', {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            showNotification(result.message, 'success');
        } else {
            showNotification('清空失败', 'error');
        }
    } catch (error) {
        showNotification('清空失败: ' + error.message, 'error');
    }
}

// 导出服务器端所有历史记录
async function exportAllServerHistory() {
    try {
        showNotification('正在准备导出...', 'info');

        const response = await fetch('/api/history/export-all');
        const result = await response.json();

        if (result.success) {
            // 自动下载文件
            await downloadServerHistoryFile(result.data.filename);
            showNotification(`已导出 ${result.data.total_records} 条记录`, 'success');
        } else {
            showNotification('导出失败', 'error');
        }
    } catch (error) {
        showNotification('导出失败: ' + error.message, 'error');
    }
}

// 添加服务器端历史记录管理按钮事件
document.addEventListener('DOMContentLoaded', async () => {
    // 在历史记录页面添加服务器端管理按钮
    const historyActions = document.querySelector('#page-history .header-actions');
    if (historyActions) {
        // 检查是否已添加过按钮
        if (!document.getElementById('serverExportBtn')) {
            const serverExportBtn = document.createElement('button');
            serverExportBtn.id = 'serverExportBtn';
            serverExportBtn.className = 'btn-secondary';
            serverExportBtn.innerHTML = '<i class="fas fa-server"></i> 导出服务器记录';
            serverExportBtn.addEventListener('click', exportAllServerHistory);
            historyActions.appendChild(serverExportBtn);
        }

        if (!document.getElementById('serverClearBtn')) {
            const serverClearBtn = document.createElement('button');
            serverClearBtn.id = 'serverClearBtn';
            serverClearBtn.className = 'btn-secondary';
            serverClearBtn.innerHTML = '<i class="fas fa-trash-alt"></i> 清空服务器';
            serverClearBtn.addEventListener('click', clearServerHistory);
            historyActions.appendChild(serverClearBtn);
        }
    }
});

// 查看服务器历史记录详情
window.viewServerHistoryDetail = async function(filename) {
    try {
        showNotification('正在加载记录详情...', 'info');

        // 下载并解析服务器历史记录文件
        const response = await fetch(`/api/history/download/${filename}`);
        if (!response.ok) {
            throw new Error('下载失败');
        }

        const recordText = await response.text();
        const record = JSON.parse(recordText);

        // 切换到批改作文页面
        const correctTab = document.querySelector('.nav-btn[data-page="correct"]');
        if (correctTab) {
            correctTab.click();
        }

        // 填充表单数据
        if (record.question_content) {
            const questionInput = document.getElementById('question_content');
            if (questionInput) questionInput.value = record.question_content;
        }
        if (record.student_answer) {
            const answerInput = document.getElementById('student_answer');
            if (answerInput) answerInput.value = record.student_answer;
        }
        if (record.grade) {
            const gradeInput = document.getElementById('grade');
            if (gradeInput) gradeInput.value = record.grade;
        }
        if (record.total_score) {
            const scoreInput = document.getElementById('total_score');
            if (scoreInput) scoreInput.value = record.total_score;
        }
        if (record.subject_chs) {
            const subjectInput = document.getElementById('subject_chs');
            if (subjectInput) subjectInput.value = record.subject_chs;
        }
        if (record.breakdown_type) {
            const breakdownInput = document.getElementById('breakdown_type');
            if (breakdownInput) breakdownInput.value = record.breakdown_type;
        }

        // 构建结果数据（适配displayResult函数）
        const resultData = {
            outputs: record.outputs || {},
            workflow_run_id: record.workflow_run_id || '',
            elapsed_time: record.elapsed_time || 0,
            total_tokens: record.total_tokens || 0
        };

        // 如果有OCR数据，恢复OCR可视化
        if (record.ocr_data) {
            console.log('📷 恢复OCR数据:', record.ocr_data);
            window.ocrResultData = record.ocr_data;

            // 显示OCR图片
            console.log('📷 查找图片元素...');
            const resultBoxesImg = document.getElementById('resultBoxesImg');
            console.log('📷 resultBoxesImg:', resultBoxesImg);

            // 检查是否有image_data
            console.log('📷 检查图片数据:');
            console.log('   - record.image_data:', record.image_data ? '有数据' : '为空');
            console.log('   - record.ocr_data.image_data:', record.ocr_data.image_data ? '有数据' : '为空');

            if (record.image_data) {
                console.log('📷 设置图片 src');
                // 将Base64数据转换为Data URI格式
                const imageDataURI = `data:image/png;base64,${record.image_data}`;
                window.currentOCRImageData = imageDataURI;
                if (resultBoxesImg) {
                    resultBoxesImg.src = imageDataURI;
                    console.log('✅ 图片src已设置:', imageDataURI.substring(0, 100) + '...');
                } else {
                    console.error('❌ resultBoxesImg 元素不存在');
                }
            } else if (record.ocr_data && record.ocr_data.image_data) {
                console.log('📷 从ocr_data中获取图片');
                // 将Base64数据转换为Data URI格式
                const imageDataURI = `data:image/png;base64,${record.ocr_data.image_data}`;
                window.currentOCRImageData = imageDataURI;
                if (resultBoxesImg) {
                    resultBoxesImg.src = imageDataURI;
                }
            } else {
                console.warn('⚠️ 图片数据不存在 - 可能是纯文本批改记录');
                // 显示提示
                if (resultBoxesImg) {
                    resultBoxesImg.alt = '纯文本批改记录，无图片';
                }
            }

            // 如果有智能标注数据和OCR块数据，显示可视化
            if (record.intelligent_annotation && record.ocr_data.boxes_data) {
                // 稍微延迟一下，确保DOM已经更新
                setTimeout(() => {
                    try {
                        // 显示智能标注到结果页面
                        showIntelligentAnnotationInResult(
                            record.intelligent_annotation,
                            record.ocr_data.boxes_data
                        );
                        console.log('✅ 智能标注可视化已恢复');
                    } catch (err) {
                        console.error('❌ 恢复智能标注可视化失败:', err);
                    }
                }, 300);
            }
        } else {
            console.log('ℹ️ record.ocr_data 为空');
        }

        // 显示结果区域
        const resultSection = document.getElementById('resultSection');
        if (resultSection) {
            resultSection.style.display = 'block';
        }

        // 使用displayResult函数显示结果（和批改完成后一样的显示方式）
        displayResult(resultData);

        // 如果有智能标注，显示智能标注区域
        if (record.intelligent_annotation && record.ocr_data && record.ocr_data.boxes_data) {
            const resultAnnotationSection = document.getElementById('resultAnnotationSection');
            if (resultAnnotationSection) {
                resultAnnotationSection.style.display = 'block';
            }
        }

        // 滚动到结果区域
        if (resultSection) {
            resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        showNotification('历史记录已加载', 'success');

    } catch (error) {
        console.error('查看服务器历史记录详情失败:', error);
        showNotification('加载记录详情失败: ' + error.message, 'error');
    }
};

// 在结果页面显示智能标注
function showIntelligentAnnotationInResult(annotationData, ocrBlocks) {
    console.log('📝 在结果页面显示智能标注', annotationData);
    console.log('📝 ocrBlocks:', ocrBlocks);

    const resultBlocksContainer = document.getElementById('resultBlocksContainer');
    const resultBlockCount = document.getElementById('resultBlockCount');
    const resultAnnotationSection = document.getElementById('resultAnnotationSection');

    console.log('📍 resultBlocksContainer:', resultBlocksContainer);
    console.log('📍 resultBlockCount:', resultBlockCount);
    console.log('📍 resultAnnotationSection:', resultAnnotationSection);

    if (!resultBlocksContainer) {
        console.error('❌ resultBlocksContainer 不存在，尝试查找备用容器');
        const altContainer = document.querySelector('#resultBlocksContainer');
        console.log('📍 altContainer:', altContainer);
        if (altContainer) {
            console.log('✅ 使用备用容器');
        } else {
            console.error('❌ 备用容器也不存在');
            return;
        }
    }

    // 清空之前的列表项
    resultBlocksContainer.innerHTML = '';
    console.log('🗑️ 已清空容器');

    // 如果没有标注数据，显示提示
    if (!annotationData) {
        console.warn('⚠️ annotationData 为空');
        resultBlocksContainer.innerHTML = '<p class="no-annotation">暂无智能标注数据</p>';
        if (resultBlockCount) resultBlockCount.textContent = '0';
        return;
    }

    // 统计智能标注数量
    let annotationCount = 0;
    const colorMap = {
        'nice_sentence': { color: '#4caf50', label: '精彩表达', icon: '✨' },
        'good_sentence': { color: '#2196f3', label: '良好表达', icon: '👍' },
        'improve_sentence': { color: '#f44336', label: '待改进', icon: '⚠️' }
    };

    console.log('🎨 开始创建智能标注列表');
    const htmlParts = [];

    // 创建智能标注列表
    Object.entries(colorMap).forEach(([type, config]) => {
        const sentences = annotationData[type] || [];
        console.log(`📝 处理 ${type}: ${sentences.length} 条`);
        if (!Array.isArray(sentences) || sentences.length === 0) return;

        sentences.forEach((sentence, idx) => {
            annotationCount++;
            const reason = sentence.nice_reason || sentence.good_reason || sentence.improve_reason || '';
            const html = `
                <div class="annotation-list-item" style="
                    padding: 12px;
                    margin-bottom: 8px;
                    background: ${config.color}15;
                    border-left: 4px solid ${config.color};
                    border-radius: 4px;
                ">
                    <div style="font-size: 0.9em; color: #666; margin-bottom: 6px;">
                        ${config.icon} <strong>${config.label}</strong>
                    </div>
                    <div style="font-style: italic; margin-bottom: 6px;">"${escapeHtml(sentence.text || '')}"</div>
                    <div style="font-size: 0.85em; color: #888;">
                        ${escapeHtml(reason)}
                    </div>
                </div>
            `;
            htmlParts.push(html);
        });
    });

    console.log(`✅ 生成 ${htmlParts.length} 个标注项`);

    if (htmlParts.length > 0) {
        resultBlocksContainer.innerHTML = htmlParts.join('');
        console.log('✅ HTML 已插入到容器');
    } else {
        resultBlocksContainer.innerHTML = '<p class="no-annotation">暂无智能标注</p>';
        console.log('ℹ️ 没有标注数据，显示空状态');
    }

    // 更新计数
    if (resultBlockCount) {
        resultBlockCount.textContent = annotationCount;
        console.log(`📊 更新计数: ${annotationCount}`);
    }

    // 确保区域可见
    if (resultAnnotationSection) {
        resultAnnotationSection.style.display = 'block';
        console.log('✅ resultAnnotationSection 已显示');
    } else {
        console.warn('⚠️ resultAnnotationSection 不存在，无法显示');
    }

    // ✅ 保存到全局变量，供弹窗使用
    window.intelligentAnnotationData = {
        annotationData: annotationData,
        currentMode: 'intelligent-annotation'
    };
    console.log('✅ 智能标注数据已保存到全局变量');

    console.log('✨ showIntelligentAnnotationInResult 完成');
}

// 从服务器历史记录填充表单
function fillFormFromServerHistory(record) {
    // 填充表单字段
    const fields = {
        'question_content': record.question_content || '',
        'student_answer': record.student_answer || '',
        'grade': record.grade || '',
        'total_score': record.total_score || '',
        'subject_chs': record.subject_chs || '',
        'breakdown_type': record.breakdown_type || ''
    };

    Object.keys(fields).forEach(fieldId => {
        const element = document.getElementById(fieldId);
        if (element) {
            element.value = fields[fieldId];
        }
    });

    // 显示结果区域
    const resultSection = document.getElementById('resultSection');
    if (resultSection && record.outputs) {
        displayResult({
            outputs: record.outputs,
            workflow_run_id: record.workflow_run_id,
            elapsed_time: record.elapsed_time,
            total_tokens: record.total_tokens
        });
    }
}

// 下载服务器历史记录
window.downloadServerHistory = function(filename) {
    downloadServerHistoryFile(filename);
};

// 删除服务器历史记录
window.deleteServerHistory = async function(filename) {
    if (!confirm(`确定要删除服务器端的文件 ${filename} 吗？`)) {
        return;
    }

    try {
        // 注意：当前的API设计中没有单个文件删除功能
        // 这里可以调用清空所有记录的API，但这不是最佳实践
        showNotification('单个文件删除功能暂未实现，请使用清空所有记录功能', 'warning');
    } catch (error) {
        console.error('删除服务器历史记录失败:', error);
        showNotification('删除失败: ' + error.message, 'error');
    }
};

// 生成报告
function generateReport(history) {
    const scores = history.map(item => parseFloat(item.outputs?.score || 0));
    const average = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '0';
    const highest = scores.length > 0 ? Math.max(...scores).toFixed(1) : '0';

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>英语作文批改报告</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; line-height: 1.6; }
        h1 { color: #667eea; border-bottom: 3px solid #667eea; padding-bottom: 10px; }
        .summary { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .stat { display: inline-block; margin: 10px 20px; }
        .stat-value { font-size: 2em; font-weight: bold; color: #667eea; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #667eea; color: white; }
        .score { font-weight: bold; }
    </style>
</head>
<body>
    <h1>📊 英语作文批改报告</h1>

    <div class="summary">
        <h2>总体统计</h2>
        <div class="stat">
            <div>新增批改数</div>
            <div class="stat-value">${history.length}</div>
        </div>
        <div class="stat">
            <div>平均分</div>
            <div class="stat-value">${average}</div>
        </div>
        <div class="stat">
            <div>最高分</div>
            <div class="stat-value">${highest}</div>
        </div>
    </div>

    <h2>详细记录</h2>
    <table>
        <thead>
            <tr>
                <th>日期</th>
                <th>题目</th>
                <th>年级</th>
                <th>分数</th>
                <th>评语</th>
            </tr>
        </thead>
        <tbody>
            ${history.map(item => {
                const date = new Date(item.timestamp);
                return `
                <tr>
                    <td>${date.toLocaleDateString()}</td>
                    <td>${escapeHtml((item.question_content || '').substring(0, 50))}</td>
                    <td>${escapeHtml(item.grade || '')}</td>
                    <td class="score">${item.outputs?.score || 'N/A'}</td>
                    <td>${escapeHtml((item.outputs?.comment || '').substring(0, 100))}</td>
                </tr>
                `;
            }).join('')}
        </tbody>
    </table>

    <p style="text-align: center; color: #999; margin-top: 40px;">
        报告生成时间: ${new Date().toLocaleString()}
    </p>
</body>
</html>
    `;
}

// ========== 数据分析 ==========

// 加载分析数据
function loadAnalytics() {
    const history = getHistory();

    // 更新统计卡片
    const totalCorrected = history.length;
    document.getElementById('totalCorrected').textContent = totalCorrected;

    if (totalCorrected > 0) {
        const scores = history.map(item => parseFloat(item.outputs?.score || 0));
        const average = scores.reduce((a, b) => a + b, 0) / scores.length;
        const highest = Math.max(...scores);
        document.getElementById('averageScore').textContent = average.toFixed(1);
        document.getElementById('highestScore').textContent = highest.toFixed(1);

        // 进步率（简单的最近10次与之前10次对比）
        if (totalCorrected >= 20) {
            const recent10 = scores.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
            const previous10 = scores.slice(10, 20).reduce((a, b) => a + b, 0) / 10;
            const improvement = ((recent10 - previous10) / previous10 * 100).toFixed(1);
            document.getElementById('improvementRate').textContent = `${improvement}%`;
        }
    }

    // 渲染分数分布图
    renderScoreDistribution(history);

    // 渲染常见错误
    renderCommonErrors(history);

    // 渲染最近批改
    renderRecentCorrections(history.slice(0, 5));
}

// 渲染分数分布图
function renderScoreDistribution(history) {
    const container = document.getElementById('scoreDistribution');
    const ranges = [
        { label: '0-5', min: 0, max: 5, count: 0 },
        { label: '6-10', min: 6, max: 10, count: 0 },
        { label: '11-15', min: 11, max: 15, count: 0 },
        { label: '16-20', min: 16, max: 20, count: 0 }
    ];

    history.forEach(item => {
        const score = parseFloat(item.outputs?.score || 0);
        const range = ranges.find(r => score >= r.min && score <= r.max);
        if (range) range.count++;
    });

    const maxCount = Math.max(...ranges.map(r => r.count), 1);

    container.innerHTML = ranges.map(range => {
        const height = (range.count / maxCount) * 200;
        return `
            <div class="chart-bar" style="height: ${height}px;">
                <div class="chart-bar-value">${range.count}</div>
                <div class="chart-bar-label">${range.label}</div>
            </div>
        `;
    }).join('');
}

// 渲染常见错误
function renderCommonErrors(history) {
    const container = document.getElementById('commonErrors');
    const errors = {};

    history.forEach(item => {
        const diagnosis = item.outputs?.grammar_diagnosis;
        if (diagnosis) {
            if (Array.isArray(diagnosis)) {
                diagnosis.forEach(err => {
                    errors[err] = (errors[err] || 0) + 1;
                });
            } else if (typeof diagnosis === 'string') {
                errors[diagnosis] = (errors[diagnosis] || 0) + 1;
            }
        }
    });

    const sortedErrors = Object.entries(errors)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    if (sortedErrors.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted);">暂无错误数据</p>';
        return;
    }

    container.innerHTML = sortedErrors.map(([error, count]) => `
        <div class="error-item">
            <h4>${escapeHtml(error)}</h4>
            <span class="error-count">出现 ${count} 次</span>
        </div>
    `).join('');
}

// 渲染最近批改
function renderRecentCorrections(recentItems) {
    const container = document.getElementById('recentCorrections');

    if (recentItems.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted);">暂无数据</p>';
        return;
    }

    container.innerHTML = recentItems.map(item => {
        const date = new Date(item.timestamp);
        return `
            <div class="recent-item" onclick="viewHistoryDetail('${item.id}')">
                <h4>${escapeHtml((item.question_content || '').substring(0, 30))}...</h4>
                <p>分数: ${item.outputs?.score || 'N/A'} | ${date.toLocaleDateString()}</p>
            </div>
        `;
    }).join('');
}

// ========== 页面数据加载 ==========

// 加载历史记录页面数据 - 使用分页加载
async function loadHistoryPageData() {
    console.log('📜 加载历史记录页面数据...');

    try {
        // 获取服务器端历史记录第一页
        const result = await loadServerHistoryList(1, 10);
        const serverFiles = result.files || [];
        console.log('📊 服务器历史记录文件数:', serverFiles.length, '总数:', result.total);

        if (serverFiles.length > 0) {
            // 使用优化版本显示服务器历史记录
            renderServerHistoryOptimized(serverFiles, result);
        } else {
            // 如果没有服务器记录，使用优化版本显示本地记录
            renderHistoryOptimized();
        }
    } catch (error) {
        console.error('❌ 加载服务器历史记录失败:', error);
        // 回退到本地历史记录
        renderHistoryOptimized();
    }
}

// 渲染服务器历史记录
function renderServerHistory(serverFiles) {
    console.log('🎨 渲染服务器历史记录，文件数:', serverFiles.length);
    const historyList = document.getElementById('historyList');

    if (!historyList) {
        console.error('❌ historyList 元素不存在！');
        return;
    }

    if (serverFiles.length === 0) {
        console.log('ℹ️ 没有服务器历史记录，显示空状态');
        historyList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <h3>暂无历史记录</h3>
                <p>开始批改作文后，记录将显示在这里</p>
            </div>
        `;
        return;
    }

    console.log('✅ 开始渲染', serverFiles.length, '条记录');

    const htmlContent = serverFiles.map(file => {
        const date = new Date(file.modified_time);
        const preview = file.preview || {};
        const score = preview.score || 'N/A';
        const grade = preview.grade || '未知';
        const answerPreview = (preview.student_answer || '暂无预览').substring(0, 100);

        return `
            <div class="history-card" data-filename="${file.filename}" data-record-id="${file.record_id}">
                <div class="history-card-header">
                    <div class="history-card-title">${escapeHtml(file.filename.split('_')[0] || '作文批改')}</div>
                    <div class="history-card-score">${score}</div>
                </div>
                <div class="history-card-meta">
                    <span><i class="fas fa-calendar"></i> ${date.toLocaleDateString()}</span>
                    <span><i class="fas fa-user"></i> ${escapeHtml(grade)}</span>
                    <span><i class="fas fa-clock"></i> ${date.toLocaleTimeString()}</span>
                </div>
                <div class="history-card-preview">
                    ${escapeHtml(answerPreview)}${answerPreview.length >= 100 ? '...' : ''}
                </div>
                <div class="history-card-actions">
                    <button class="btn-icon" onclick="viewServerHistoryDetail('${file.filename}')">
                        <i class="fas fa-eye"></i> 查看
                    </button>
                    <button class="btn-icon" onclick="downloadServerHistory('${file.filename}')">
                        <i class="fas fa-download"></i> 下载
                    </button>
                    <button class="btn-icon delete-btn" onclick="deleteServerHistory('${file.filename}')">
                        <i class="fas fa-trash"></i> 删除
                    </button>
                </div>
            </div>
        `;
    }).join('');

    historyList.innerHTML = htmlContent;

    console.log('✅ 渲染完成，历史记录数量:', serverFiles.length);
}

// ========== 历史记录优化加载 ==========

// 优化配置
const HISTORY_CONFIG = {
    PAGE_SIZE: 20,  // 每页加载数量
    OVERSCAN: 10,   // 预渲染数量（上下各10条）
    MIN_ITEM_HEIGHT: 120  // 最小记录项高度
};

// 优化后的历史记录状态
const historyState = {
    localData: [],
    serverData: [],
    filteredData: [],
    displayedData: [],
    currentPage: 0,
    isLoading: false,
    hasMore: true,
    serverCurrentPage: 1,  // 服务器端当前页码
    totalRecords: 0,       // 服务器端总记录数
    filters: {
        search: '',
        grade: '',
        scoreRange: '',
        date: ''
    }
};

// 优化版本：渲染本地历史记录
function renderHistoryOptimized(filters = {}) {
    console.log('🎨 renderHistoryOptimized 被调用，筛选条件:', filters);
    const historyList = document.getElementById('historyList');

    if (!historyList) {
        console.error('❌ historyList 元素不存在！');
        return;
    }

    // 更新筛选条件
    historyState.filters = { ...historyState.filters, ...filters };
    historyState.currentPage = 0;
    historyState.isLoading = false;
    historyState.hasMore = true;

    // 获取本地历史记录
    historyState.localData = getHistory();
    console.log('📊 读取到本地历史记录:', historyState.localData.length, '条');

    // 应用筛选
    applyHistoryFilters();

    // 清空并设置虚拟滚动容器
    setupVirtualScrollContainer(historyList);

    // 初始加载
    loadMoreHistory();

    // 绑定筛选事件
    bindFilterEvents();
}

// 应用筛选条件
function applyHistoryFilters() {
    let data = [...historyState.localData];

    // 搜索筛选
    if (historyState.filters.search) {
        const searchLower = historyState.filters.search.toLowerCase();
        data = data.filter(item =>
            (item.question_content && item.question_content.toLowerCase().includes(searchLower)) ||
            (item.student_answer && item.student_answer.toLowerCase().includes(searchLower))
        );
    }

    // 年级筛选
    if (historyState.filters.grade) {
        data = data.filter(item => item.grade === historyState.filters.grade);
    }

    // 分数筛选
    if (historyState.filters.scoreRange) {
        const [min, max] = historyState.filters.scoreRange.split('-').map(Number);
        data = data.filter(item => {
            const score = parseFloat(item.outputs?.score || 0);
            return score >= min && score <= max;
        });
    }

    // 日期筛选
    if (historyState.filters.date) {
        const filterDate = new Date(historyState.filters.date).toISOString().split('T')[0];
        data = data.filter(item => {
            const itemDate = new Date(item.timestamp).toISOString().split('T')[0];
            return itemDate === filterDate;
        });
    }

    historyState.filteredData = data;
    console.log('✅ 筛选后记录数:', historyState.filteredData.length);
}

// 设置简单列表容器
function setupVirtualScrollContainer(container) {
    container.innerHTML = `
        <div id="history-list-container" style="border: 1px solid rgba(0,0,0,0.05); border-radius: 8px; background: white; padding: 10px;">
            <div id="history-content"></div>
            <div id="loading-more" style="display: none; text-align: center; padding: 20px; color: #666;">
                <i class="fas fa-spinner fa-spin"></i> 加载中...
            </div>
            <div id="no-more-data" style="display: none; text-align: center; padding: 20px; color: #999;">
                <i class="fas fa-check-circle"></i> 已显示所有记录
            </div>
        </div>
    `;
}
// 渲染历史记录列表
function renderHistoryList() {
    const contentDiv = document.getElementById('history-content');
    if (!contentDiv) return;

    let html = '';
    historyState.displayedData.forEach(item => {
        html += createHistoryCardHTML(item);
    });

    contentDiv.innerHTML = html;
}

// 创建历史记录卡片HTML
function createHistoryCardHTML(item, index = 0) {
    const date = new Date(item.timestamp);
    const score = item.outputs?.score || 'N/A';
    const questionPreview = (item.question_content || '').substring(0, 50) + '...';
    const answerPreview = (item.student_answer || '').substring(0, 100) + '...';

    return `
        <div class="history-card" data-id="${item.id}">
            <div class="history-card-header">
                <div class="history-card-title">${escapeHtml(questionPreview)}</div>
                <div class="history-card-score">${score}</div>
            </div>
            <div class="history-card-content">
                <div class="history-card-question">
                    <i class="fas fa-book-open"></i> ${escapeHtml(answerPreview)}
                </div>
                <div class="history-card-meta">
                    <span><i class="fas fa-calendar"></i> ${date.toLocaleString()}</span>
                    <span><i class="fas fa-user"></i> ${escapeHtml(item.grade || 'N/A')}</span>
                    <span><i class="fas fa-tag"></i> ${escapeHtml(item.subject_chs || '英语')}</span>
                </div>
            </div>
            <div class="history-card-actions">
                <button class="btn-small" onclick="viewHistoryDetail('${item.id}')">
                    <i class="fas fa-eye"></i> 查看
                </button>
                <button class="btn-small btn-secondary" onclick="reCorrectHistory('${item.id}')">
                    <i class="fas fa-redo"></i> 重新批改
                </button>
                <button class="btn-small btn-danger" onclick="deleteHistoryRecord('${item.id}')">
                    <i class="fas fa-trash"></i> 删除
                </button>
            </div>
        </div>
    `;
}

// 加载更多历史记录
function loadMoreHistory() {
    if (historyState.isLoading || !historyState.hasMore) {
        return;
    }

    historyState.isLoading = true;
    const loadingDiv = document.getElementById('loading-more');
    if (loadingDiv) loadingDiv.style.display = 'block';

    // 模拟异步加载
    setTimeout(() => {
        const start = historyState.currentPage * HISTORY_CONFIG.PAGE_SIZE;
        const end = start + HISTORY_CONFIG.PAGE_SIZE;
        const newItems = historyState.filteredData.slice(start, end);

        if (newItems.length === 0) {
            historyState.hasMore = false;
            const noMoreDiv = document.getElementById('no-more-data');
            if (noMoreDiv) noMoreDiv.style.display = 'block';
        } else {
            historyState.displayedData.push(...newItems);
            historyState.currentPage++;
        }

        historyState.isLoading = false;
        if (loadingDiv) loadingDiv.style.display = 'none';

        // 重新渲染列表
        renderHistoryList();

        console.log('✅ 已加载', historyState.displayedData.length, '条记录');
    }, 100);
}

// 绑定筛选事件
function bindFilterEvents() {
    const searchInput = document.getElementById('searchInput');
    const gradeFilter = document.getElementById('gradeFilter');
    const scoreFilter = document.getElementById('scoreFilter');
    const dateFilter = document.getElementById('dateFilter');

    if (searchInput) {
        // 防抖处理
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                renderHistoryOptimized({ search: e.target.value });
            }, 300);
        });
    }

    if (gradeFilter) {
        gradeFilter.addEventListener('change', (e) => {
            renderHistoryOptimized({ grade: e.target.value });
        });
    }

    if (scoreFilter) {
        scoreFilter.addEventListener('change', (e) => {
            renderHistoryOptimized({ scoreRange: e.target.value });
        });
    }

    if (dateFilter) {
        dateFilter.addEventListener('change', (e) => {
            renderHistoryOptimized({ date: e.target.value });
        });
    }
}

// 优化版本：渲染服务器历史记录
function renderServerHistoryOptimized(serverFiles, pageResult = null) {
    console.log('🎨 渲染服务器历史记录（优化版），文件数:', serverFiles.length);
    const historyList = document.getElementById('historyList');

    if (!historyList) {
        console.error('❌ historyList 元素不存在！');
        return;
    }

    if (serverFiles.length === 0) {
        console.log('ℹ️ 没有服务器历史记录，显示空状态');
        historyList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <h3>暂无历史记录</h3>
                <p>开始批改作文后，记录将显示在这里</p>
            </div>
        `;
        return;
    }

    // 初始化状态
    historyState.serverData = serverFiles;
    historyState.currentPage = 0;
    historyState.isLoading = false;
    historyState.hasMore = (pageResult && serverFiles.length < pageResult.size) ? false : true;
    historyState.totalRecords = pageResult ? pageResult.total : serverFiles.length;
    historyState.serverCurrentPage = pageResult ? pageResult.page : 1;

    // 转换第一页数据并存入 displayedData
    historyState.displayedData = serverFiles.map(file => {
        const filename = file.filename || file.name || 'unknown_record.json';
        return {
            id: file.record_id || file.filename,
            filename: filename,
            timestamp: file.modified_time || new Date().toISOString(),
            question_content: file.preview?.question_content || filename.replace('history_', '').replace('.json', '').replace(/_/g, ' '),
            student_answer: file.preview?.student_answer || '',
            grade: file.preview?.grade || '',
            outputs: {
                score: file.preview?.score || 'N/A'
            }
        };
    });

    // 清空并设置虚拟滚动容器
    setupVirtualScrollContainer(historyList);

    // 渲染第一页数据
    renderHistoryList();
    console.log('✅ 已加载', historyState.displayedData.length, '条服务器记录（第一页）');

    // 绑定筛选事件（服务器端记录暂不支持筛选）
    bindFilterEvents();
}

// 加载更多服务器历史记录 - 从服务器获取下一页
async function loadMoreServerHistory() {
    if (historyState.isLoading || !historyState.hasMore) {
        return;
    }

    historyState.isLoading = true;
    const loadingDiv = document.getElementById('loading-more');
    if (loadingDiv) loadingDiv.style.display = 'block';

    try {
        // 计算下一页
        const nextPage = historyState.serverCurrentPage + 1;

        // 从服务器获取下一页数据
        const result = await loadServerHistoryList(nextPage, 10);
        const newFiles = result.files || [];

        if (newFiles.length === 0) {
            // 没有更多数据
            historyState.hasMore = false;
            const noMoreDiv = document.getElementById('no-more-data');
            if (noMoreDiv) noMoreDiv.style.display = 'block';
        } else {
            // 转换服务器记录格式
            const convertedItems = newFiles.map(file => {
                const filename = file.filename || file.name || 'unknown_record.json';
                return {
                    id: file.record_id || file.filename,
                    filename: filename,
                    timestamp: file.modified_time || new Date().toISOString(),
                    question_content: file.preview?.question_content || filename.replace('history_', '').replace('.json', '').replace(/_/g, ' '),
                    student_answer: file.preview?.student_answer || '',
                    grade: file.preview?.grade || '',
                    outputs: {
                        score: file.preview?.score || 'N/A'
                    }
                };
            });

            // 合并数据
            historyState.displayedData.push(...convertedItems);
            historyState.serverCurrentPage = result.page || nextPage;
            historyState.serverData.push(...newFiles);

            // 检查是否还有更多数据
            if (newFiles.length < 10) {
                historyState.hasMore = false;
                const noMoreDiv = document.getElementById('no-more-data');
                if (noMoreDiv) noMoreDiv.style.display = 'block';
            }
        }

        historyState.isLoading = false;
        if (loadingDiv) loadingDiv.style.display = 'none';

        // 重新渲染列表
        renderHistoryList();

        console.log('✅ 已加载', historyState.displayedData.length, '条服务器记录');
    } catch (error) {
        console.error('❌ 加载更多服务器历史记录失败:', error);
        historyState.isLoading = false;
        if (loadingDiv) loadingDiv.style.display = 'none';
    }
}

// 创建独立的历史记录查看器
function createHistoryViewer() {
    console.log('🎨 创建独立的历史记录查看器...');

    // 获取历史记录数据（重新获取，因为可能被覆盖了）
    const historyList = document.getElementById('historyList');
    const records = Array.from(historyList.children).filter(child =>
        child.classList.contains('history-card') && child.dataset.filename
    );

    console.log('📊 找到历史记录数量:', records.length);

    // 创建查看器
    const viewer = document.createElement('div');
    viewer.id = 'history-viewer';
    viewer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.9);
        z-index: 100001;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 20px;
        box-sizing: border-box;
        overflow-y: auto;
    `;

    // 标题栏
    const header = document.createElement('div');
    header.style.cssText = `
        width: 100%;
        max-width: 800px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding: 20px;
        background: white;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;

    header.innerHTML = `
        <h2 style="margin: 0; color: #333;">📋 历史记录查看器 (${records.length}个记录)</h2>
        <button onclick="document.getElementById('history-viewer').remove()" style="
            background: #dc3545;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
        ">关闭</button>
    `;

    // 记录容器
    const container = document.createElement('div');
    container.style.cssText = `
        width: 100%;
        max-width: 800px;
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        background: white;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;

    // 生成记录列表
    let html = '<div style="display: grid; gap: 15px;">';

    records.forEach((record, index) => {
        const filename = record.dataset.filename || '';
        const title = filename.replace('history_', '').replace('.json', '').replace(/_/g, ' ');

        html += `
            <div style="
                background: #f8f9fa;
                border: 1px solid #dee2e6;
                border-radius: 8px;
                padding: 15px;
                cursor: pointer;
                transition: all 0.3s ease;
            " onmouseover="this.style.background='#e9ecef'" onmouseout="this.style.background='#f8f9fa'">
                <div style="font-weight: bold; color: #333; margin-bottom: 8px;">
                    📄 ${title}
                </div>
                <div style="color: #666; font-size: 14px;">
                    记录 #${index + 1} - 点击查看详情
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;

    // 添加点击事件
    setTimeout(() => {
        const recordCards = container.querySelectorAll('div[style*="cursor: pointer"]');
        recordCards.forEach((card, index) => {
            card.onclick = () => {
                const record = records[index];
                showRecordDetail(record);
            };
        });
    }, 100);

    viewer.appendChild(header);
    viewer.appendChild(container);
    document.body.appendChild(viewer);

    console.log('✅ 独立历史记录查看器已创建');
}

// 显示记录详情
async function showRecordDetail(recordElement) {
    const filename = recordElement.dataset.filename;
    if (!filename) return;

    console.log('📖 显示记录详情:', filename);

    try {
        // 显示加载状态
        const loadingDiv = document.createElement('div');
        loadingDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 20px;
            border-radius: 10px;
            z-index: 100002;
            font-size: 16px;
        `;
        loadingDiv.textContent = '正在加载记录详情...';
        document.body.appendChild(loadingDiv);

        // 从服务器获取完整的记录数据
        const response = await fetch(`/api/history/download/${filename}`);
        if (!response.ok) {
            throw new Error('获取记录失败');
        }

        const recordData = await response.json();
        document.body.removeChild(loadingDiv);

        // 创建详细的记录查看器
        createRecordDetailViewer(recordData, filename);

    } catch (error) {
        console.error('加载记录详情失败:', error);
        document.body.removeChild(loadingDiv);

        // 显示错误信息
        alert(`加载记录详情失败: ${error.message}`);
    }
}

// 创建详细的记录查看器
function createRecordDetailViewer(recordData, filename) {
    const viewer = document.createElement('div');
    viewer.id = 'record-detail-viewer';
    viewer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.7);
        z-index: 100003;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 20px;
        box-sizing: border-box;
        overflow-y: auto;
    `;

    // 标题栏
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding: 20px;
        background: white;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;

    const title = filename.replace('history_', '').replace('.json', '').replace(/_/g, ' ');
    header.innerHTML = `
        <h2 style="margin: 0; color: #333;">📄 批改详情 - ${title}</h2>
        <div style="display: flex; gap: 10px;">
            <button onclick="window.print()" style="
                background: #6c757d;
                color: white;
                border: none;
                padding: 10px 15px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 5px;
            ">
                🖨️ 打印
            </button>
            <button onclick="navigator.share ? navigator.share({
                title: '英语作文批改结果',
                text: '查看我的作文批改详情',
                url: window.location.href
            }).catch(console.error) : navigator.clipboard.writeText(window.location.href)" style="
                background: #6c757d;
                color: white;
                border: none;
                padding: 10px 15px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 5px;
            ">
                📤 分享
            </button>
            <button onclick="document.getElementById('record-detail-viewer').remove()" style="
                background: #495057;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 14px;
            ">关闭</button>
        </div>
    `;

    // 内容区域
    const content = document.createElement('div');
    content.style.cssText = `
        flex: 1;
        max-width: 900px;
        width: 100%;
        overflow-y: auto;
        background: white;
        border-radius: 10px;
        padding: 30px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        line-height: 1.6;
    `;

    // 构建内容HTML
    let html = '';

    // 基本信息
    html += `
        <div style="border-bottom: 2px solid #ddd; padding-bottom: 20px; margin-bottom: 20px;">
            <h3 style="color: #333; margin-top: 0;">📊 基本信息</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; color: #555;">
                <div><strong>年级:</strong> ${recordData.grade || '未指定'}</div>
                <div><strong>科目:</strong> ${recordData.subject_chs || '未指定'}</div>
                <div><strong>题型:</strong> ${recordData.breakdown_type || '未指定'}</div>
                <div><strong>总分:</strong> ${recordData.total_score || '未指定'}</div>
            </div>
            <div style="margin-top: 10px; color: #666;">
                <strong>批改时间:</strong> ${new Date(recordData.timestamp).toLocaleString()}
            </div>
        </div>
    `;

    // 作文题目
    if (recordData.question_content) {
        html += `
            <div style="margin-bottom: 30px;">
                <h3 style="color: #333;">📝 作文题目</h3>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; border-left: 4px solid #888; color: #333;">
                    ${recordData.question_content.replace(/\n/g, '<br>')}
                </div>
            </div>
        `;
    }

    // 学生答案
    if (recordData.student_answer) {
        html += `
            <div style="margin-bottom: 30px;">
                <h3 style="color: #333;">✍️ 学生答案</h3>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; border-left: 4px solid #666; white-space: pre-wrap; font-family: 'Courier New', monospace; color: #333;">
                    ${recordData.student_answer}
                </div>
            </div>
        `;
    }

    // 批改结果
    if (recordData.outputs) {
        const outputs = recordData.outputs;

        // 总分和等级
        if (outputs.score !== undefined) {
            html += `
                <div style="margin-bottom: 30px;">
                    <h3 style="color: #333;">🎯 批改结果</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 20px; margin-bottom: 20px;">
                        <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #e0e0e0 0%, #c0c0c0 100%); color: #333; border-radius: 10px; border: 1px solid #bbb;">
                            <div style="font-size: 36px; font-weight: bold;">${outputs.score}</div>
                            <div>总分</div>
                        </div>
            `;

            if (outputs.composition_basic_info?.grade) {
                html += `
                        <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #d0d0d0 0%, #b0b0b0 100%); color: #333; border-radius: 10px; border: 1px solid #aaa;">
                            <div style="font-size: 24px; font-weight: bold;">${outputs.composition_basic_info.grade}</div>
                            <div>等级</div>
                        </div>
                `;
            }

            html += `
                    </div>
                </div>
            `;
        }

        // 维度评分
        if (outputs.score_dimension && outputs.score_dimension.length > 0) {
            html += `
                <div style="margin-bottom: 30px;">
                    <h4 style="color: #333; border-bottom: 2px solid #ddd; padding-bottom: 8px;">📈 维度评分</h4>
                    <div style="display: grid; gap: 15px;">
            `;

            outputs.score_dimension.forEach(dimension => {
                const score = dimension.dimension_score;
                const color = score >= 4 ? '#888' : score >= 3 ? '#999' : '#aaa';

                html += `
                        <div style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; background: #f8f8f8;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <strong style="color: #333;">${dimension.dimension_name}</strong>
                                <span style="background: ${color}; color: white; padding: 5px 12px; border-radius: 20px; font-weight: bold;">
                                    ${dimension.dimension_score}分
                                </span>
                            </div>
                            <div style="color: #666; font-size: 14px;">
                                ${dimension.dimension_reason}
                            </div>
                        </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        }

        // 整体评价
        if (outputs.composition_overall_evaluation) {
            const evaluation = outputs.composition_overall_evaluation;

            // 优点
            if (evaluation.advantages && evaluation.advantages.length > 0) {
                html += `
                    <div style="margin-bottom: 30px;">
                        <h4 style="color: #333; border-bottom: 2px solid #ddd; padding-bottom: 8px;">✅ 优点</h4>
                        <ul style="padding-left: 20px;">
                `;

                evaluation.advantages.forEach(advantage => {
                    html += `<li style="margin-bottom: 8px; color: #555;">${advantage.advantage_name}：${advantage.advantage_reason}</li>`;
                });

                html += `
                        </ul>
                    </div>
                `;
            }

            // 良好句子
            if (evaluation.overall_good_sentences && evaluation.overall_good_sentences.length > 0) {
                html += `
                    <div style="margin-bottom: 30px;">
                        <h4 style="color: #333; border-bottom: 2px solid #ddd; padding-bottom: 8px;">🌟 良好句子</h4>
                        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; border-left: 4px solid #888;">
                `;

                evaluation.overall_good_sentences.forEach(sentence => {
                    html += `<p style="margin: 10px 0; font-style: italic; color: #333;">"${sentence.text}"</p>`;
                    html += `<p style="margin: 5px 0; font-size: 14px; color: #666;">${sentence.reason}</p>`;
                });

                html += `
                        </div>
                    </div>
                `;
            }

            // 改进建议
            if (evaluation.improvement_list && evaluation.improvement_list.length > 0) {
                html += `
                    <div style="margin-bottom: 30px;">
                        <h4 style="color: #333; border-bottom: 2px solid #ddd; padding-bottom: 8px;">💡 改进建议</h4>
                        <div style="background: #f8f8f8; border: 1px solid #ddd; border-radius: 5px; padding: 15px;">
                `;

                evaluation.improvement_list.forEach(improvement => {
                    html += `
                        <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #ddd;">
                            <strong style="color: #333;">${improvement.improvement_name}</strong>
                            <div style="margin: 8px 0;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                                    <span style="font-size: 14px; color: #666; font-weight: bold;">❌ 原句:</span>
                                    <button onclick="navigator.clipboard.writeText('${(improvement.original_sentence || '').replace(/'/g, "\\'")}')" style="font-size: 12px; padding: 3px 8px; background: #e0e0e0; border: 1px solid #ccc; border-radius: 3px; cursor: pointer;">复制</button>
                                </div>
                                <div style="padding: 8px; background: white; border-radius: 3px; font-family: monospace; color: #555; border: 1px solid #ccc;">
                                    ${improvement.original_sentence || ''}
                                </div>
                            </div>
                            <div style="margin: 8px 0;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                                    <span style="font-size: 14px; color: #333; font-weight: bold;">✅ 建议:</span>
                                    <button onclick="navigator.clipboard.writeText('${(improvement.improvement_sentence || '').replace(/'/g, "\\'")}')" style="font-size: 12px; padding: 3px 8px; background: #e0e0e0; border: 1px solid #ccc; border-radius: 3px; cursor: pointer;">复制</button>
                                </div>
                                <div style="padding: 8px; background: white; border-radius: 3px; font-family: monospace; color: #333; border: 1px solid #ccc;">
                                    ${improvement.improvement_sentence || ''}
                                </div>
                            </div>
                            <div style="margin-top: 8px; color: #666; font-size: 14px;">
                                ${improvement.improvement_reason}
                            </div>
                        </div>
                    `;
                });

                html += `
                        </div>
                    </div>
                `;
            }
        }

        // 智能标注
        if (outputs.intelligent_annotation) {
            const annotation = outputs.intelligent_annotation;

            html += `
                <div style="margin-bottom: 30px;">
                    <h4 style="color: #333; border-bottom: 2px solid #ddd; padding-bottom: 8px;">🎨 智能标注</h4>
            `;

            // 良好句子
            if (annotation.nice_sentence && annotation.nice_sentence.length > 0) {
                html += `
                    <div style="margin-bottom: 20px;">
                        <h5 style="color: #555; margin-bottom: 10px; font-size: 16px;">🌟 良好句子</h5>
                        <div style="background: #f5f5f5; border: 1px solid #ddd; border-radius: 5px; padding: 15px;">
                `;

                annotation.nice_sentence.forEach(sentence => {
                    html += `
                        <div style="margin-bottom: 15px; padding: 10px; background: white; border-radius: 3px; border-left: 3px solid #888;">
                            <p style="margin: 5px 0; font-style: italic; color: #333;">"${sentence.text}"</p>
                            <p style="margin: 5px 0; font-size: 14px; color: #666;">${sentence.nice_reason}</p>
                        </div>
                    `;
                });

                html += `
                        </div>
                    </div>
                `;
            }

            // 良好句子
            if (annotation.good_sentence && annotation.good_sentence.length > 0) {
                html += `
                    <div style="margin-bottom: 20px;">
                        <h5 style="color: #555; margin-bottom: 10px; font-size: 16px;">👍 良好句子</h5>
                        <div style="background: #f5f5f5; border: 1px solid #ddd; border-radius: 5px; padding: 15px;">
                `;

                annotation.good_sentence.forEach(sentence => {
                    html += `
                        <div style="margin-bottom: 15px; padding: 10px; background: white; border-radius: 3px; border-left: 3px solid #999;">
                            <p style="margin: 5px 0; font-style: italic; color: #333;">"${sentence.text}"</p>
                            <p style="margin: 5px 0; font-size: 14px; color: #666;">${sentence.good_reason}</p>
                        </div>
                    `;
                });

                html += `
                        </div>
                    </div>
                `;
            }

            html += `
                </div>
            `;
        }

        // 维度分析
        if (outputs.strongest_dimension || outputs.to_improve_dimension) {
            html += `
                <div style="margin-bottom: 30px;">
                    <h4 style="color: #333; border-bottom: 2px solid #ddd; padding-bottom: 8px;">📊 维度分析</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
            `;

            if (outputs.strongest_dimension) {
                html += `
                        <div style="background: linear-gradient(135deg, #e8e8e8 0%, #c0c0c0 100%); color: #333; padding: 20px; border-radius: 10px; text-align: center; border: 1px solid #bbb;">
                            <div style="font-size: 18px; margin-bottom: 10px;">🎯</div>
                            <div style="font-weight: bold;">最强维度</div>
                            <div style="font-size: 20px; margin-top: 10px;">${outputs.strongest_dimension}</div>
                        </div>
                `;
            }

            if (outputs.to_improve_dimension) {
                html += `
                        <div style="background: linear-gradient(135deg, #f5f5f5 0%, #d0d0d0 100%); color: #333; padding: 20px; border-radius: 10px; text-align: center; border: 1px solid #bbb;">
                            <div style="font-size: 18px; margin-bottom: 10px;">📈</div>
                            <div style="font-weight: bold;">待改进维度</div>
                            <div style="font-size: 20px; margin-top: 10px;">${outputs.to_improve_dimension}</div>
                        </div>
                `;
            }

            html += `
                    </div>
                </div>
            `;
        }

        // 作文基本信息
        if (outputs.composition_basic_info) {
            const basicInfo = outputs.composition_basic_info;
            html += `
                <div style="margin-bottom: 30px;">
                    <h4 style="color: #333; border-bottom: 2px solid #ddd; padding-bottom: 8px;">📝 作文基本信息</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
            `;

            if (basicInfo.word_count) {
                html += `
                        <div style="text-align: center; padding: 15px; background: #f5f5f5; border-radius: 8px; border: 1px solid #ddd;">
                            <div style="font-size: 24px; font-weight: bold; color: #555;">${basicInfo.word_count}</div>
                            <div style="color: #666;">字数</div>
                        </div>
                `;
            }

            if (basicInfo.grade) {
                html += `
                        <div style="text-align: center; padding: 15px; background: #f5f5f5; border-radius: 8px; border: 1px solid #ddd;">
                            <div style="font-size: 24px; font-weight: bold; color: #555;">${basicInfo.grade}</div>
                            <div style="color: #666;">等级</div>
                        </div>
                `;
            }

            html += `
                    </div>
                </div>
            `;
        }

        // 推荐书籍
        if (outputs.recommended_books && outputs.recommended_books.length > 0) {
            html += `
                <div style="margin-bottom: 30px;">
                    <h4 style="color: #333; border-bottom: 2px solid #ddd; padding-bottom: 8px;">📚 推荐书籍</h4>
                    <div style="background: #f8f8f8; border: 1px solid #ddd; border-radius: 8px; padding: 20px;">
            `;

            outputs.recommended_books.forEach(book => {
                html += `
                        <div style="margin-bottom: 15px; padding: 15px; background: white; border-radius: 5px; border-left: 4px solid #999;">
                            <div style="font-weight: bold; color: #333; margin-bottom: 5px;">《${book.name}》</div>
                            <div style="color: #666; font-size: 14px; margin-bottom: 8px;">作者: ${book.author}</div>
                            <div style="color: #555; font-size: 14px;">${book.reason}</div>
                        </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        }

        // 总结评论
        if (outputs.summary_comment) {
            html += `
                <div style="margin-bottom: 30px;">
                    <h4 style="color: #333; border-bottom: 2px solid #ddd; padding-bottom: 8px;">📝 总结评论</h4>
                    <div style="background: #f8f8f8; border: 1px solid #ddd; border-radius: 8px; padding: 20px; line-height: 1.6;">
                        <p style="margin: 0; color: #333; font-size: 16px;">${outputs.summary_comment}</p>
                    </div>
                </div>
            `;
        }

        // 技术信息
        html += `
            <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #ddd; font-size: 12px; color: #666;">
                <h4 style="margin-top: 0; color: #333;">🔧 技术信息</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
                    <div><strong>工作流ID:</strong> ${recordData.workflow_run_id || '无'}</div>
                    <div><strong>运行时间:</strong> ${recordData.elapsed_time ? recordData.elapsed_time + '秒' : '未知'}</div>
                    <div><strong>Token消耗:</strong> ${recordData.total_tokens || '未知'}</div>
                </div>
            </div>
        `;
    }

    content.innerHTML = html;

    // 添加打印样式
    const printStyle = document.createElement('style');
    printStyle.textContent = `
        @media print {
            body > *:not(#record-detail-viewer) { display: none !important; }
            #record-detail-viewer {
                position: static !important;
                background: white !important;
                box-shadow: none !important;
                padding: 0 !important;
                margin: 0 !important;
            }
            #record-detail-viewer > div:first-child { display: none !important; }
            #record-detail-viewer > div:last-child {
                padding: 20px !important;
                margin: 0 !important;
                max-width: none !important;
            }
            button { display: none !important; }
        }
    `;
    document.head.appendChild(printStyle);

    viewer.appendChild(header);
    viewer.appendChild(content);
    document.body.appendChild(viewer);

    // 强制重绘以确保正确渲染
    viewer.style.display = 'none';
    viewer.offsetHeight; // 触发重绘
    viewer.style.display = '';

    console.log('✅ 详细记录查看器已创建');
}

// 加载页面数据
function loadPageData(pageName) {
    console.log('🔄 loadPageData 被调用，页面:', pageName);
    switch (pageName) {
        case 'history':
            console.log('📜 加载历史记录页面...');
            console.log('📤 调用 loadHistoryPageData...');

            // 立即验证页面状态
            const historyPage = document.getElementById('page-history');
            console.log('📋 历史记录页面状态:', {
                exists: !!historyPage,
                active: historyPage?.classList.contains('active'),
                display: historyPage ? window.getComputedStyle(historyPage).display : 'null',
                visibility: historyPage ? window.getComputedStyle(historyPage).visibility : 'null'
            });

            loadHistoryPageData();
            console.log('✅ loadHistoryPageData 调用完成');
            break;
        case 'analytics':
            loadAnalytics();
            break;
        case 'batch':
            // 批量处理页面初始化
            initializeBatchProcessing();
            break;
    }
}

// ========== 新增：带历史记录的结果显示函数 ==========

// 带历史记录保存的显示结果函数
function displayResultWithHistory(formData, resultData) {
    console.log('📝 displayResultWithHistory 被调用');
    console.log('formData:', formData);
    console.log('resultData:', resultData);

    // 安全检查formData
    if (!formData) {
        console.error('❌ formData is null, cannot save to history');
        // 仍然显示结果,但不保存历史
        displayResult(resultData);
        return;
    }

    // 保存到历史记录
    const historyData = {
        question_content: formData.question_content || '',
        student_answer: formData.student_answer || '',
        grade: formData.grade || '',
        total_score: formData.total_score || '',
        subject_chs: formData.subject_chs || '',
        breakdown_type: formData.breakdown_type || '',
        // ✅ 包含OCR坐标数据到outputs中，确保智能标注可视化可以恢复
        outputs: {
            ...resultData.outputs,
            // 优先从API返回的ocr_data中获取boxes_data,否则使用全局变量
            boxes_data: resultData.ocr_data?.boxes_data || window.ocrResultData?.boxes_data || []
        },
        workflow_run_id: resultData.workflow_run_id,
        elapsed_time: resultData.elapsed_time,
        total_tokens: resultData.total_tokens,
        // ✅ 新增：智能标注数据
        intelligent_annotation: {
            annotationData: window.intelligentAnnotationData || resultData.intelligent_annotation || null,  // 优先使用全局变量中的智能标注数据
            currentMode: currentAnnotationMode || 'text-blocks',  // 当前模式
            imageData: window.currentOCRImageData || null,  // 图片数据
            version: '2.1'  // 版本升级，包含坐标修复
        },
        // 存储图片（用于恢复OCR可视化）
        image_data: window.currentOCRImageData || null
    };

    console.log('💾 准备保存历史记录:', historyData);
    addToHistory(historyData);

    // 显示结果
    displayResult(resultData);
}

// 保存原函数
const originalDisplayResultFunc = displayResult;

// 覆盖displayResult函数（保持向后兼容）
displayResult = function(data) {
    originalDisplayResultFunc(data);
};

// ========== 批量处理 ==========

// 批量处理初始化
function initializeBatchProcessing() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('batchFileInput');

    if (!uploadArea || !fileInput) return;

    // 拖拽上传
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files);
        handleBatchFiles(files);
    });

    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        handleBatchFiles(files);
    });
}

// 处理批量文件
function handleBatchFiles(files) {
    if (files.length === 0) return;

    showNotification(`已选择 ${files.length} 个文件`, 'info');

    // 解析文件
    Promise.all(files.map(file => parseBatchFile(file)))
        .then(results => {
            const allItems = results.flat();
            showBatchPreview(allItems);
        })
        .catch(error => {
            showNotification('文件解析失败: ' + error.message, 'error');
        });
}

// 解析批量文件
function parseBatchFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                let items = [];

                if (file.name.endsWith('.json')) {
                    const data = JSON.parse(content);
                    items = Array.isArray(data) ? data : [data];
                } else if (file.name.endsWith('.csv')) {
                    const lines = content.split('\n').filter(l => l.trim());
                    items = lines.map(line => {
                        const [question, answer] = line.split(',');
                        return {
                            question_content: question?.trim(),
                            student_answer: answer?.trim()
                        };
                    });
                } else if (file.name.endsWith('.txt')) {
                    const lines = content.split('\n').filter(l => l.trim());
                    items = lines.map(line => ({
                        student_answer: line.trim()
                    }));
                }

                resolve(items.filter(item => item.student_answer));
            } catch (e) {
                reject(e);
            }
        };
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsText(file, 'utf-8');
    });
}

// 显示批量预览
function showBatchPreview(items) {
    const preview = document.getElementById('batchPreview');
    const previewList = document.getElementById('batchPreviewList');

    previewList.innerHTML = items.slice(0, 5).map((item, index) => `
        <div class="batch-preview-item">
            <strong>#${index + 1}</strong>
            <p>${escapeHtml(item.student_answer?.substring(0, 100))}...</p>
        </div>
    `).join('');

    preview.style.display = 'block';

    // 开始批量批改按钮
    const startBtn = document.getElementById('startBatchBtn');
    startBtn.onclick = () => startBatchProcessing(items);
}

// 开始批量批改
function startBatchProcessing(items) {
    showNotification('开始批量批改...', 'info');

    // 切换到队列页面
    document.querySelector('[data-tab="queue"]').click();
    document.querySelector('.tab-btn[data-tab="queue"]').click();

    // 处理每个项目
    processBatchQueue(items, 0);
}

// 处理批量队列
function processBatchQueue(items, index) {
    if (index >= items.length) {
        showNotification('批量批改完成！', 'success');
        return;
    }

    const item = items[index];
    renderQueueItem(item, index, 'processing');

    // 调用批改API（模拟）
    setTimeout(() => {
        renderQueueItem(item, index, 'completed');
        processBatchQueue(items, index + 1);
    }, 2000);
}

// 渲染队列项
function renderQueueItem(item, index, status) {
    const queueList = document.getElementById('queueList');

    const statusClass = {
        pending: 'pending',
        processing: 'processing',
        completed: 'completed',
        failed: 'failed'
    }[status] || 'pending';

    const statusText = {
        pending: '等待中',
        processing: '处理中',
        completed: '已完成',
        failed: '失败'
    }[status] || '等待中';

    const queueItem = document.createElement('div');
    queueItem.className = 'queue-item';
    queueItem.innerHTML = `
        <div class="queue-info">
            <h4>作文 #${index + 1}</h4>
            <div class="queue-meta">
                <span>${escapeHtml(item.student_answer?.substring(0, 50))}...</span>
            </div>
        </div>
        <div class="queue-status status-${statusClass}">
            <span>${statusText}</span>
        </div>
    `;

    // 插入到队列顶部
    if (queueList.firstChild) {
        queueList.insertBefore(queueItem, queueList.firstChild);
    } else {
        queueList.appendChild(queueItem);
    }
}

// ========================================
// 图片上传和OCR处理功能
// ========================================

// 输入方式切换
document.addEventListener('DOMContentLoaded', function() {
    const modeTabs = document.querySelectorAll('.mode-tab');
    const textInputArea = document.getElementById('text-input-area');
    const imageInputArea = document.getElementById('image-input-area');

    modeTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const mode = this.dataset.mode;

            // 切换标签状态
            modeTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            // 切换内容区域
            if (mode === 'text') {
                textInputArea.style.display = 'block';
                imageInputArea.style.display = 'none';
                // 移除图片输入的必填验证
                document.getElementById('student_answer').required = true;
                document.getElementById('imageInput').required = false;
            } else {
                textInputArea.style.display = 'none';
                imageInputArea.style.display = 'block';
                // 设置图片输入的必填验证
                document.getElementById('student_answer').required = false;
                document.getElementById('imageInput').required = true;
            }
        });
    });

    // 图片上传相关元素
    const imageUploadArea = document.getElementById('imageUploadArea');
    const imageInput = document.getElementById('imageInput');
    const imagePreview = document.getElementById('imagePreview');
    const previewImg = document.getElementById('previewImg');
    const removeImageBtn = document.getElementById('removeImage');
    const ocrProcessBtn = document.getElementById('ocrProcessBtn');
    const ocrResult = document.getElementById('ocrResult');
    const ocrText = document.getElementById('ocrText');
    const ocrVisualization = document.getElementById('ocrVisualization');

    // 点击上传区域选择文件
    imageUploadArea.addEventListener('click', () => {
        imageInput.click();
    });

    // ========== 弹窗功能：查看原图 ==========
    const annotationModal = document.getElementById('annotationModal');
    const modalImageWithBoxes = document.getElementById('modalImageWithBoxes');
    const modalBoxesImg = document.getElementById('modalBoxesImg');
    const modalBlocksContainer = document.getElementById('modalBlocksContainer');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const viewOcrOriginalBtn = document.getElementById('viewOcrOriginalBtn');
    const viewResultOriginalBtn = document.getElementById('viewResultOriginalBtn');

    // 确保弹窗在页面加载时是隐藏的
    if (annotationModal && annotationModal.classList.contains('active')) {
        console.warn('⚠️ 弹窗在页面加载时意外激活，强制隐藏');
        annotationModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    // 打开弹窗
    function openAnnotationModal(imageSrc, boxesData, annotationData) {
        console.log('🖼️ 打开弹窗，显示原图与标注');
        console.log('  图片数据:', imageSrc ? '已提供' : '未提供');
        console.log('  文本块数据:', boxesData ? boxesData.length : 0, '个');
        console.log('  智能标注数据:', annotationData ? '已提供' : '未提供');

        // 清空弹窗中的旧内容
        const existingBoxes = modalImageWithBoxes.querySelectorAll('.ocr-text-box, .annotation-box');
        existingBoxes.forEach(box => box.remove());
        modalBlocksContainer.innerHTML = '';

        // 设置图片
        modalBoxesImg.src = imageSrc;

        // 定义显示标注的函数，避免重复调用
        let isAnnotationShown = false;
        const showAnnotations = function() {
            if (isAnnotationShown) {
                console.log('⚠️ 标注已显示，跳过重复调用');
                return;
            }
            isAnnotationShown = true;

            console.log('📝 弹窗图片加载完成，开始添加标注');

            // 如果有智能标注数据，显示智能标注
            if (annotationData) {
                console.log('✅ 弹窗中显示智能标注');
                // 这里调用智能标注显示逻辑，但使用弹窗的容器
                showIntelligentAnnotationInModal(annotationData, boxesData);
            } else if (boxesData) {
                console.log('✅ 弹窗中显示OCR文本块');
                // 显示OCR文本块
                showOCRTextBlocksInModal(boxesData);
            }
        };

        // 等待图片加载完成后添加标注
        // 防止重复绑定，先移除旧的监听器
        modalBoxesImg.onload = null;
        modalBoxesImg.onload = showAnnotations;

        // 如果图片已经加载完成，立即执行
        if (modalBoxesImg.complete && modalBoxesImg.naturalHeight !== 0) {
            console.log('⚡ 图片已加载，直接显示标注');
            showAnnotations();
        }

        // 显示弹窗
        annotationModal.classList.add('active');
        document.body.style.overflow = 'hidden'; // 防止背景滚动
    }

    // 关闭弹窗
    function closeAnnotationModal() {
        annotationModal.classList.remove('active');
        document.body.style.overflow = ''; // 恢复背景滚动

        // ⚠️ 重要：清空弹窗中的内容，防止下次打开时重复显示
        const existingBoxes = modalImageWithBoxes.querySelectorAll('.ocr-text-box, .annotation-box');
        existingBoxes.forEach(box => box.remove());
        modalBlocksContainer.innerHTML = '';
    }

    // 关闭按钮事件
    closeModalBtn.addEventListener('click', closeAnnotationModal);

    // 点击背景关闭弹窗
    annotationModal.addEventListener('click', (e) => {
        if (e.target === annotationModal) {
            closeAnnotationModal();
        }
    });

    // ESC键关闭弹窗
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && annotationModal.classList.contains('active')) {
            closeAnnotationModal();
        }
    });

    // OCR查看原图按钮事件
    if (viewOcrOriginalBtn) {
        viewOcrOriginalBtn.addEventListener('click', () => {
            if (window.ocrResultData && window.ocrResultData.boxes_data) {
                const imageSrc = window.currentOCRImageData || document.getElementById('boxesImg').src;
                openAnnotationModal(imageSrc, window.ocrResultData.boxes_data, null);
            } else {
                showNotification('没有可显示的OCR数据', 'warning');
            }
        });
    }

    // 批改结果查看原图按钮事件
    if (viewResultOriginalBtn) {
        viewResultOriginalBtn.addEventListener('click', () => {
            if (window.ocrResultData && window.ocrResultData.boxes_data) {
                const imageSrc = window.currentOCRImageData || document.getElementById('resultBoxesImg').src;

                // ✅ 修复：兼容两种数据格式
                // 1. 历史记录恢复的嵌套格式：{ annotationData: {...}, currentMode: "..." }
                // 2. 批改完成的直接格式：{ nice_sentence: [...], good_sentence: [...] }
                let annotationData = null;
                if (window.intelligentAnnotationData) {
                    if (window.intelligentAnnotationData.annotationData) {
                        // 嵌套格式（历史记录恢复）
                        annotationData = window.intelligentAnnotationData.annotationData;
                        console.log('📦 使用嵌套格式的智能标注数据');
                    } else {
                        // 直接格式（批改完成）
                        annotationData = window.intelligentAnnotationData;
                        console.log('📦 使用直接格式的智能标注数据');
                    }
                }

                console.log('🔍 弹窗打开时智能标注数据:', annotationData);
                console.log('  window.intelligentAnnotationData:', window.intelligentAnnotationData);
                openAnnotationModal(imageSrc, window.ocrResultData.boxes_data, annotationData);
            } else {
                showNotification('没有可显示的智能标注数据', 'warning');
            }
        });
    }

    // 在弹窗中显示智能标注
    function showIntelligentAnnotationInModal(annotationData, ocrBlocks) {
        console.log('📝 在弹窗中显示智能标注');
        console.log('📝 annotationData:', annotationData);
        console.log('📝 ocrBlocks length:', ocrBlocks ? ocrBlocks.length : 0);

        // 清空弹窗容器，防止重复显示 - 使用更强的清空方法
        console.log('🧹 清空弹窗容器，当前子元素数量:', modalBlocksContainer.children.length);
        while (modalBlocksContainer.firstChild) {
            modalBlocksContainer.removeChild(modalBlocksContainer.firstChild);
        }
        modalBlocksContainer.innerHTML = '';
        console.log('✅ 弹窗容器已清空');

        // 延迟执行以确保图片完全渲染
        setTimeout(() => {
            // ✅ 添加详细调试信息
            console.log('🔍 [调试] showIntelligentAnnotationInModal 详细检查:');
            console.log('  annotationData 类型:', typeof annotationData);
            console.log('  annotationData 结构:', annotationData ? Object.keys(annotationData) : 'null/undefined');
            console.log('  nice_sentence:', annotationData?.nice_sentence);
            console.log('  good_sentence:', annotationData?.good_sentence);
            console.log('  improve_sentence:', annotationData?.improve_sentence);
            console.log('  ocrBlocks 数量:', ocrBlocks?.length);

            const matches = matchAnnotationToOCRBlocks(annotationData, ocrBlocks);

            // ✅ 添加匹配结果调试信息
            console.log('🔍 [调试] 匹配结果:', matches);
            console.log('  nice_sentence 匹配数量:', matches.nice_sentence.length);
            console.log('  good_sentence 匹配数量:', matches.good_sentence.length);
            console.log('  improve_sentence 匹配数量:', matches.improve_sentence.length);

            // 计算弹窗中图片的缩放比例
            const scaleInfo = getImageScaleInfo(modalBoxesImg, ocrBlocks);
            console.log('🔍 弹窗智能标注图片缩放信息:', scaleInfo);
            console.log('🔍 弹窗智能标注图片当前尺寸:', {
                offsetWidth: modalBoxesImg.offsetWidth,
                offsetHeight: modalBoxesImg.offsetHeight,
                clientWidth: modalBoxesImg.clientWidth,
                clientHeight: modalBoxesImg.clientHeight,
                naturalWidth: modalBoxesImg.naturalWidth,
                naturalHeight: modalBoxesImg.naturalHeight
            });

        // 创建颜色映射
        const colorMap = {
            'nice_sentence': { color: '#4caf50', label: '精彩表达', icon: '✨' },
            'good_sentence': { color: '#2196f3', label: '良好表达', icon: '👍' },
            'improve_sentence': { color: '#f44336', label: '待改进', icon: '⚠️' }
        };

        // 添加智能标注图例
        const legend = document.createElement('div');
        legend.className = 'annotation-legend';
        legend.innerHTML = `
            <h4><i class="fas fa-layer-group"></i> 智能标注图例</h4>
            <div class="legend-items">
                <div class="legend-item">
                    <span class="legend-color" style="background: #4caf50;"></span>
                    <span>✨ 精彩表达</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color" style="background: #2196f3;"></span>
                    <span>👍 良好表达</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color" style="background: #f44336;"></span>
                    <span>⚠️ 待改进</span>
                </div>
            </div>
        `;
        console.log('📊 添加智能标注图例');
        modalBlocksContainer.appendChild(legend);
        console.log('📊 图例添加完成，当前子元素数量:', modalBlocksContainer.children.length);

        // 为了避免颜色重叠，每个OCR块只显示一个最重要的标注
        const ocrIndexToBestSentence = {};

        // 标注类型优先级
        const getTypePriority = (type) => {
            const priorities = {
                'nice_sentence': 3,
                'good_sentence': 2,
                'improve_sentence': 1
            };
            return priorities[type] || 0;
        };

        // 先找出每个OCR块的最佳匹配
        Object.entries(matches).forEach(([type, sentences]) => {
            const config = colorMap[type];
            if (!config || !Array.isArray(sentences)) return;

            sentences.forEach(sentence => {
                if (sentence.similarity >= 0.3 && sentence.ocrIndex >= 0) {
                    const current = ocrIndexToBestSentence[sentence.ocrIndex];
                    if (!current || getTypePriority(type) > getTypePriority(current.type)) {
                        ocrIndexToBestSentence[sentence.ocrIndex] = {
                            sentence: sentence,
                            config: config,
                            type: type
                        };
                    }
                }
            });
        });

        // 然后显示每个OCR块的最佳标注
        const processedIndexes = new Set(); // 用于跟踪已处理的OCR索引，避免重复
        Object.entries(ocrIndexToBestSentence).forEach(([ocrIndex, data]) => {
            const sentence = data.sentence;
            const config = data.config;
            const type = data.type;

            // 防止重复添加相同OCR索引的标注
            const indexKey = `${sentence.ocrIndex}-${type}`;
            if (processedIndexes.has(indexKey)) {
                return;
            }
            processedIndexes.add(indexKey);

            // 添加到列表
            console.log(`📝 添加列表项 ${ocrIndex}:`, sentence.text?.substring(0, 20));
            const listItem = createResultAnnotationListItem(sentence, config, type, sentence.ocrIndex);
            modalBlocksContainer.appendChild(listItem);
            console.log(`📝 列表项添加完成，当前子元素数量:`, modalBlocksContainer.children.length);

            // 在弹窗图片上添加标注框（传入正确的缩放比例）
            addResultAnnotationBoxByCoords(sentence, config, sentence.ocrIndex, ocrBlocks, scaleInfo, modalImageWithBoxes);
        });

        console.log('✅ 弹窗智能标注显示完成');
        }, 500); // 延迟500ms确保图片完全渲染和样式应用
    }

    // 在弹窗中显示OCR文本块
    function showOCRTextBlocksInModal(boxesData) {
        console.log('📝 在弹窗中显示OCR文本块，共', boxesData.length, '个');

        // 清空弹窗容器，防止重复显示 - 使用更强的清空方法
        while (modalBlocksContainer.firstChild) {
            modalBlocksContainer.removeChild(modalBlocksContainer.firstChild);
        }
        modalBlocksContainer.innerHTML = '';

        // 延迟执行以确保图片完全渲染
        setTimeout(() => {
            // 计算弹窗中图片的缩放比例
            const scaleInfo = getImageScaleInfo(modalBoxesImg, boxesData);
            console.log('🔍 弹窗图片缩放信息:', scaleInfo);
            console.log('🔍 弹窗图片当前尺寸:', {
                offsetWidth: modalBoxesImg.offsetWidth,
                offsetHeight: modalBoxesImg.offsetHeight,
                clientWidth: modalBoxesImg.clientWidth,
                clientHeight: modalBoxesImg.clientHeight,
                naturalWidth: modalBoxesImg.naturalWidth,
                naturalHeight: modalBoxesImg.naturalHeight
            });

            // 添加文本块列表和文本框
            // 过滤掉无效坐标的文本块
            const validBoxesData = boxesData.filter((box, index) => {
                const coords = getBoxCoordinates(box);
                if (coords === null) {
                    console.log(`  ⚠️ 弹窗中跳过无效坐标文本块 ${index + 1}:`, box.text?.substring(0, 30));
                    return false;
                }
                return true;
            });

            console.log(`📝 弹窗中过滤后有效文本块数量: ${validBoxesData.length}/${boxesData.length}`);

            validBoxesData.forEach((box, index) => {
                const blockItem = createTextBlockItem(box, index);
                modalBlocksContainer.appendChild(blockItem);

                // 在弹窗图片上添加文本框（传入缩放比例）
                addTextBoxToImage(box, index, scaleInfo, modalImageWithBoxes);
            });
        }, 500); // 延迟500ms确保图片完全渲染和样式应用
    }

    // 文件选择处理
    imageInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            handleImageSelect(file);
        }
    });

    // 拖拽上传
    imageUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        imageUploadArea.style.borderColor = 'var(--primary-dark)';
        imageUploadArea.style.background = 'rgba(255, 255, 255, 0.9)';
    });

    imageUploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        imageUploadArea.style.borderColor = 'var(--primary)';
        imageUploadArea.style.background = 'rgba(255, 255, 255, 0.8)';
    });

    imageUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        imageUploadArea.style.borderColor = 'var(--primary)';
        imageUploadArea.style.background = 'rgba(255, 255, 255, 0.8)';

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                handleImageSelect(file);
            } else {
                showNotification('请上传图片文件', 'error');
            }
        }
    });

    // 处理图片选择
    function handleImageSelect(file) {
        // 验证文件类型
        if (!file.type.startsWith('image/')) {
            showNotification('请上传图片文件', 'error');
            return;
        }

        // 验证文件大小（限制为10MB）
        if (file.size > 10 * 1024 * 1024) {
            showNotification('图片大小不能超过10MB', 'error');
            return;
        }

        // 显示预览
        const reader = new FileReader();
        reader.onload = function(e) {
            const imageData = e.target.result;
            previewImg.src = imageData;
            imagePreview.style.display = 'block';
            ocrResult.style.display = 'none';
            ocrText.value = '';
            imageUploadArea.style.display = 'none';

            // 保存图片数据到全局变量，供OCR可视化使用
            window.currentOCRImageData = imageData;

            // 提示用户进行OCR识别
            showNotification('图片上传成功，请点击"OCR识别"按钮进行文字识别', 'info');
        };
        reader.readAsDataURL(file);
    }

    // 移除图片
    removeImageBtn.addEventListener('click', () => {
        imageInput.value = '';
        previewImg.src = '';
        imagePreview.style.display = 'none';
        ocrResult.style.display = 'none';
        ocrVisualization.style.display = 'none';
        ocrText.value = '';
        imageUploadArea.style.display = 'block';
    });

    // 全局变量存储OCR结果
window.ocrResultData = null;

// OCR处理
    ocrProcessBtn.addEventListener('click', async () => {
        if (!imageInput.files[0]) {
            showNotification('请先上传图片', 'error');
            return;
        }

        try {
            ocrProcessBtn.disabled = true;
            ocrProcessBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 识别中...';

            const formData = new FormData();
            formData.append('image', imageInput.files[0]);

            const response = await fetch('/api/v2/ocr', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            console.log('🔍 OCR响应结果:', { success: result.success, hasText: !!result.full_text, message: result.message });

            if (result.success) {
                console.log('✅ OCR成功，开始处理结果');
                const recognizedText = result.full_text || result.text || '';
                ocrText.value = recognizedText;
                // 自动填充到学生答案字段
                document.getElementById('student_answer').value = recognizedText;
                ocrResult.style.display = 'block';

                // 保存OCR结果到全局变量
                window.ocrResultData = {
                    text: recognizedText,
                    boxes_data: result.boxes_data || [],
                    image_id: result.image_id
                };

                // 显示OCR坐标可视化（仅文本块视图）
                if (result.boxes_data && result.boxes_data.length > 0) {
                    showOCRVisualization(result.boxes_data);
                }

                showNotification('OCR识别成功，已保存识别结果', 'success');
            } else {
                console.error('❌ OCR失败:', result);
                showNotification('OCR识别失败: ' + (result.message || '未知错误'), 'error');
            }
        } catch (error) {
            console.error('💥 OCR请求异常:', error);
            showNotification('OCR识别失败: ' + error.message, 'error');
        } finally {
            ocrProcessBtn.disabled = false;
            ocrProcessBtn.innerHTML = '<i class="fas fa-magic"></i> OCR识别';
        }
    });
});

// ========== OCR坐标可视化功能 ==========

// 显示OCR可视化
function showOCRVisualization(boxesData) {
    console.log('🔍 showOCRVisualization 被调用');
    console.log('  boxesData:', boxesData);
    console.log('  boxesData 长度:', boxesData ? boxesData.length : 0);

    const ocrVisualization = document.getElementById('ocrVisualization');
    const boxesImg = document.getElementById('boxesImg');
    const blocksContainer = document.getElementById('blocksContainer');
    const blockCountSpan = document.getElementById('blockCount');
    const thumbnailOverlay = document.getElementById('thumbnailOverlay');

    console.log('  DOM元素检查:', {
        ocrVisualization: !!ocrVisualization,
        boxesImg: !!boxesImg,
        blocksContainer: !!blocksContainer,
        blockCountSpan: !!blockCountSpan,
        thumbnailOverlay: !!thumbnailOverlay
    });

    if (!ocrVisualization) {
        console.error('❌ ocrVisualization 元素不存在');
        return;
    }

    if (!boxesData || boxesData.length === 0) {
        console.warn('⚠️ boxesData 为空或长度为零');
        return;
    }

    console.log('✅ 开始处理 OCR 可视化');

    // 设置图片源 - 优先使用全局保存的OCR图片数据
    if (window.currentOCRImageData) {
        boxesImg.src = window.currentOCRImageData;
        console.log('✅ 使用全局保存的OCR图片数据');
    } else {
        // 备用方案：从previewImg获取
        const previewImg = document.getElementById('previewImg');
        if (previewImg && previewImg.src && previewImg.src !== '') {
            boxesImg.src = previewImg.src;
            console.log('✅ 使用previewImg的图片数据');
        } else {
            console.error('❌ 没有找到可用的图片数据');
            showNotification('图片数据丢失，请重新上传图片', 'error');
            return;
        }
    }

    // 清除之前的内容
    blocksContainer.innerHTML = '';

    // 清空图片上的文本框
    const existingBoxes = document.querySelectorAll('.ocr-text-box');
    existingBoxes.forEach(box => box.remove());

    // 等待图片加载完成后显示遮罩层和列表
    boxesImg.onload = function() {
        console.log('📝 图片加载完成，开始添加文本块');

        // 更新文本块计数
        if (blockCountSpan) {
            blockCountSpan.textContent = boxesData.length;
        }

        // 添加文本块到列表（不在缩略图上显示文本框）
        console.log('📝 开始添加文本块到列表，共', boxesData.length, '个');

        // 过滤掉无效坐标的文本块
        const validBoxesData = boxesData.filter((box, index) => {
            const coords = getBoxCoordinates(box);
            if (coords === null) {
                console.log(`  ⚠️ 跳过无效坐标文本块 ${index + 1}:`, box.text?.substring(0, 30));
                return false;
            }
            return true;
        });

        console.log(`📝 过滤后有效文本块数量: ${validBoxesData.length}/${boxesData.length}`);

        validBoxesData.forEach((box, index) => {
            console.log(`  处理有效文本块 ${index + 1}:`, {
                text: box.text?.substring(0, 30),
                bbox: getBoxCoordinates(box)
            });

            const blockItem = createTextBlockItem(box, index);
            blocksContainer.appendChild(blockItem);
            // ⚠️ 注意：不再在缩略图上添加文本框，只在弹窗中显示
        });

        console.log('✅ 所有文本块已添加完成（仅列表，缩略图不显示文本框）');

        // 显示可视化区域
        ocrVisualization.style.display = 'block';
        console.log('✅ 可视化区域已显示，display =', getComputedStyle(ocrVisualization).display);
    };

    // 如果图片已经加载完成，立即执行
    if (boxesImg.complete && boxesImg.naturalHeight !== 0) {
        boxesImg.onload();
    }

    // 切换框显隐按钮事件
    if (toggleBoxesBtn) {
        toggleBoxesBtn.onclick = () => {
            const textBoxes = document.querySelectorAll('.ocr-text-box');
            const isVisible = textBoxes.length > 0 && textBoxes[0].style.display !== 'none';

            textBoxes.forEach(box => {
                box.style.display = isVisible ? 'none' : 'block';
            });

            toggleBoxesBtn.innerHTML = isVisible
                ? '<i class="fas fa-square-full"></i> 显示框'
                : '<i class="fas fa-square-full"></i> 隐藏框';
        };
    }
}

// 创建文本块列表项
function createTextBlockItem(box, index) {
    const item = document.createElement('div');
    item.className = 'text-block-item';
    item.dataset.index = index;

    const confidence = box.confidence ? (box.confidence * 100).toFixed(1) + '%' : 'N/A';
    const coords = getBoxCoordinates(box);

    item.innerHTML = `
        <div class="text-block-header">
            <span class="text-block-index">文本块 #${index + 1}</span>
            <span class="text-block-confidence">置信度: ${confidence}</span>
        </div>
        <div class="text-block-content">${escapeHtml(box.text || box.content || '')}</div>
        <div class="text-block-coords">坐标: ${coords}</div>
    `;

    // 点击高亮对应的文本框
    item.addEventListener('click', () => {
        highlightTextBox(index);
        highlightBlockItem(index);
    });

    return item;
}

// 在图片上添加文本框
function addTextBoxToImage(box, index, scaleInfo = null, container = null) {
    console.log(`  🖼️ 处理文本框 ${index + 1}`);

    // 如果没有指定容器，使用默认的OCR页面容器
    const imageWithBoxes = container || document.getElementById('imageWithBoxes');

    // 根据容器自动选择正确的图片元素
    let boxesImg = document.getElementById('boxesImg');  // 默认OCR页面图片
    if (container && container.id === 'modalImageWithBoxes') {
        boxesImg = document.getElementById('modalBoxesImg');  // 弹窗图片
    } else if (container && container.id === 'resultImageWithBoxes') {
        boxesImg = document.getElementById('resultBoxesImg');  // 批改结果页图片
    }

    if (!imageWithBoxes || !boxesImg) {
        console.warn(`    ⚠️ DOM元素缺失: imageWithBoxes=${!!imageWithBoxes}, boxesImg=${!!boxesImg}`);
        return;
    }

    const coords = getBoxCoordinates(box);
    console.log(`    原始坐标:`, coords);

    if (!coords) {
        console.warn(`    ⚠️ 没有坐标信息`);
        return;
    }

    let [x, y, w, h] = coords;

    // 确保坐标是数字类型
    x = Number(x);
    y = Number(y);
    w = Number(w);
    h = Number(h);

    // 如果提供了缩放信息，则转换坐标
    if (scaleInfo) {
        x = x * scaleInfo.scaleX;
        y = y * scaleInfo.scaleY;
        w = w * scaleInfo.scaleX;
        h = h * scaleInfo.scaleY;

        // 应用容器偏移量（如果存在）
        if (scaleInfo.offsetX !== undefined && scaleInfo.offsetY !== undefined) {
            x = x + scaleInfo.offsetX;
            y = y + scaleInfo.offsetY;
            console.log(`    应用容器偏移量: offsetX=${scaleInfo.offsetX.toFixed(1)}, offsetY=${scaleInfo.offsetY.toFixed(1)}`);
        }

        console.log(`    转换后坐标: [${x}, ${y}, ${w}, ${h}] (缩放比例: ${scaleInfo.scaleX.toFixed(3)}, ${scaleInfo.scaleY.toFixed(3)})`);
    }

    // 创建文本框元素
    const textBox = document.createElement('div');
    textBox.className = 'ocr-text-box';
    textBox.dataset.index = index;
    textBox.style.left = x + 'px';
    textBox.style.top = y + 'px';
    textBox.style.width = w + 'px';
    textBox.style.height = h + 'px';
    textBox.style.position = 'absolute';

    // 添加标签
    const label = document.createElement('div');
    label.className = 'box-label';
    label.textContent = `#${index + 1}`;
    textBox.appendChild(label);

    // 添加文本提示
    const boxText = document.createElement('div');
    boxText.className = 'box-text';
    boxText.textContent = (box.text || box.content || '').substring(0, 20);
    textBox.appendChild(boxText);

    // 点击高亮对应的列表项
    textBox.addEventListener('click', () => {
        highlightBlockItem(index);
        highlightTextBox(index);
    });

    imageWithBoxes.appendChild(textBox);
    console.log(`    ✅ 文本框已添加，位置: (${x.toFixed(1)}, ${y.toFixed(1)}), 大小: ${w.toFixed(1)}x${h.toFixed(1)}`);
}

// 获取文本框坐标
function getBoxCoordinates(box) {
    // 尝试多种可能的坐标字段名
    if (box.bbox) {
        console.log('  使用 bbox 坐标:', box.bbox);
        // 检查是否为无效坐标 [0, 0, 0, 0]
        if (Array.isArray(box.bbox) && box.bbox.length === 4 &&
            box.bbox[0] === 0 && box.bbox[1] === 0 && box.bbox[2] === 0 && box.bbox[3] === 0) {
            console.log('  ⚠️ 检测到无效坐标 [0,0,0,0]，跳过此文本块');
            return null;
        }
        return box.bbox;
    }
    if (box.coordinates) {
        console.log('  使用 coordinates 坐标:', box.coordinates);
        return box.coordinates;
    }
    if (box.box) {
        console.log('  使用 box 坐标:', box.box);
        // 检查是否是顶点坐标格式（4个顶点的数组）
        if (Array.isArray(box.box) && box.box.length === 4) {
            console.log('  检测为顶点坐标，转换为边界框');
            return convertVerticesToBbox(box.box);
        }
        return box.box;
    }
    if (Array.isArray(box) && box.length === 4) {
        console.log('  使用直接数组坐标:', box);
        // 检查是否是顶点坐标格式
        const firstPoint = box[0];
        if (Array.isArray(firstPoint) || (typeof firstPoint === 'object' && firstPoint !== null)) {
            console.log('  检测为顶点坐标，转换为边界框');
            return convertVerticesToBbox(box);
        }
        return box;
    }
    if (box.rect) {
        console.log('  使用 rect 坐标:', box.rect);
        return [box.rect.x, box.rect.y, box.rect.w, box.rect.h];
    }

    // 如果没有坐标信息，返回默认值
    console.log('  ⚠️ 未找到坐标信息，box对象:', box);
    return null;
}

// 将四边形顶点坐标转换为边界框 [x, y, w, h]
function convertVerticesToBbox(vertices) {
    console.log('  🔄 开始转换顶点坐标:', vertices);

    if (!Array.isArray(vertices) || vertices.length !== 4) {
        console.log('  ❌ 顶点坐标格式不正确:', { length: vertices?.length, expected: 4 });
        return null;
    }

    // 提取所有点的 x, y 坐标
    const xCoords = vertices.map(v => Array.isArray(v) ? v[0] : v.x).filter(v => !isNaN(v));
    const yCoords = vertices.map(v => Array.isArray(v) ? v[1] : v.y).filter(v => !isNaN(v));

    console.log('  📊 提取坐标:', { xCoords, yCoords });

    if (xCoords.length === 0 || yCoords.length === 0) {
        console.log('  ❌ 无法提取有效坐标');
        return null;
    }

    // 计算边界框
    const minX = Math.min(...xCoords);
    const maxX = Math.max(...xCoords);
    const minY = Math.min(...yCoords);
    const maxY = Math.max(...yCoords);

    const width = maxX - minX;
    const height = maxY - minY;

    const bbox = [minX, minY, width, height];
    console.log('  ✅ 转换完成，边界框:', bbox);

    return bbox;
}

// ========================================
// 多行文本处理辅助函数
// ========================================

// 计算两个OCR块之间的几何邻近性
function calculateBlockProximity(block1, block2) {
    const coords1 = getBoxCoordinates(block1);
    const coords2 = getBoxCoordinates(block2);

    if (!coords1 || !coords2) return { score: 0, isSameLine: false, verticalGap: Infinity, horizontalOverlap: 0 };

    const [x1, y1, w1, h1] = coords1;
    const [x2, y2, w2, h2] = coords2;

    // 计算垂直间距（行间距）
    const verticalGap = Math.max(0, y2 - (y1 + h1));

    // 计算水平重叠
    const horizontalOverlap = Math.max(0,
        Math.min(x1 + w1, x2 + w2) - Math.max(x1, x2)
    );

    // 计算水平距离（处理换行）
    const horizontalGap = Math.max(0,
        x2 - (x1 + w1),  // 当前块右边缘到下一块左边缘
        x1 - (x2 + w2)   // 下一块右边缘到当前块左边缘
    );

    // 判断是否属于同一逻辑行
    const isSameLine = verticalGap < h1 * 0.8;  // 垂直间距小于行高的80%

    // 判断是否属于同一段落列
    const isSameColumn = horizontalOverlap > 10 || horizontalGap < 30;

    // 计算邻近性分数 (0-1之间)
    let proximityScore = 0;
    if (isSameLine && isSameColumn) {
        proximityScore = 1.0;  // 完全邻近
    } else if (isSameLine) {
        proximityScore = 0.7;  // 同一行但列不对齐
    } else if (verticalGap < h1 * 1.5) {
        proximityScore = 0.3;  // 相邻行
    }

    return {
        score: proximityScore,
        isSameLine: isSameLine,
        verticalGap: verticalGap,
        horizontalOverlap: horizontalOverlap,
        horizontalGap: horizontalGap,
        lineHeight: h1
    };
}

// 计算多个OCR块的联合边界框
function calculateMergedBoundingBox(ocrBlocks, indexes) {
    if (!indexes || indexes.length === 0) return null;

    const coords = indexes.map(i => getBoxCoordinates(ocrBlocks[i])).filter(c => c);

    if (coords.length === 0) return null;

    const x1 = Math.min(...coords.map(c => c[0]));
    const y1 = Math.min(...coords.map(c => c[1]));
    const x2 = Math.max(...coords.map(c => c[0] + c[2]));
    const y2 = Math.max(...coords.map(c => c[1] + c[3]));

    // 添加内边距，避免边界裁剪
    const padding = 3;

    return {
        x: x1 - padding,
        y: y1 - padding,
        w: (x2 - x1) + padding * 2,
        h: (y2 - y1) + padding * 2
    };
}

// 合并连续的OCR块（基于几何邻近性和文本长度）
function mergeConsecutiveBlocks(ocrBlocks, startIndex, targetTextLength) {
    const mergedIndexes = [startIndex];
    let currentText = (ocrBlocks[startIndex].text || ocrBlocks[startIndex].content || '').trim();
    let currentLength = currentText.length;

    // 向前合并（处理文本颠倒的情况）
    let prevIndex = startIndex - 1;
    let prevAttempts = 0;
    const maxPrevAttempts = 3;  // 最多尝试向前合并3次

    while (prevIndex >= 0 && prevAttempts < maxPrevAttempts && currentLength < targetTextLength * 1.5) {
        const prevText = (ocrBlocks[prevIndex].text || ocrBlocks[prevIndex].content || '').trim();

        // 检查是否应该合并（基于几何邻近性）
        const proximity = calculateBlockProximity(ocrBlocks[prevIndex], ocrBlocks[startIndex]);

        // 合并条件：
        // 1. 邻近性分数 > 0.3
        // 2. 文本长度合理（不超过目标长度的1.5倍）
        if (proximity.score > 0.3 && prevText.length + currentLength < targetTextLength * 2) {
            mergedIndexes.unshift(prevIndex);
            currentText = prevText + ' ' + currentText;
            currentLength = currentText.length;
            startIndex = prevIndex;
            prevAttempts++;
        }
        prevIndex--;
    }

    // 向后合并
    let nextIndex = startIndex + 1;
    let nextAttempts = 0;
    const maxNextAttempts = 5;  // 最多尝试向后合并5次

    while (nextIndex < ocrBlocks.length && nextAttempts < maxNextAttempts && currentLength < targetTextLength * 1.5) {
        const nextText = (ocrBlocks[nextIndex].text || ocrBlocks[nextIndex].content || '').trim();

        // 检查与前一个块的邻近性
        const proximity = calculateBlockProximity(ocrBlocks[nextIndex - 1], ocrBlocks[nextIndex]);

        if (proximity.score > 0.3 && currentLength + nextText.length < targetTextLength * 2) {
            mergedIndexes.push(nextIndex);
            currentText = currentText + ' ' + nextText;
            currentLength = currentText.length;
            nextAttempts++;
        }
        nextIndex++;
    }

    return {
        indexes: mergedIndexes,
        text: currentText.trim(),
        boundingBox: calculateMergedBoundingBox(ocrBlocks, mergedIndexes)
    };
}

// 使用滑动窗口查找最佳多块匹配
function findBestMultiBlockMatch(targetText, ocrBlocks, maxWindowSize = 5) {
    let bestMatch = {
        indexes: [],
        text: '',
        similarity: 0,
        boundingBox: null
    };

    // 尝试不同长度的窗口
    for (let len = 1; len <= Math.min(maxWindowSize, ocrBlocks.length); len++) {
        for (let start = 0; start <= ocrBlocks.length - len; start++) {
            // 合并窗口内的文本
            let mergedText = '';
            const indexes = [];

            for (let i = 0; i < len; i++) {
                const block = ocrBlocks[start + i];
                indexes.push(start + i);

                const blockText = (block.text || block.content || '').trim();
                if (blockText) {
                    mergedText += (i > 0 ? ' ' : '') + blockText;
                }
            }

            // 计算相似度
            const similarity = calculateSimilarity(targetText, mergedText);

            // 保留最佳匹配
            if (similarity > bestMatch.similarity) {
                bestMatch = {
                    indexes: indexes,
                    text: mergedText,
                    similarity: similarity,
                    boundingBox: calculateMergedBoundingBox(ocrBlocks, indexes)
                };
            }
        }
    }

    return bestMatch;
}

// 获取图片缩放比例信息
function getImageScaleInfo(imgElement, boxesData) {
    if (!imgElement || !boxesData || boxesData.length === 0) {
        console.warn('⚠️ getImageScaleInfo: 参数不完整，返回默认缩放比例');
        return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
    }

    // 获取图片的实际显示尺寸（优先使用offsetWidth，兼容不同容器）
    const displayWidth = imgElement.offsetWidth || imgElement.clientWidth || 0;
    const displayHeight = imgElement.offsetHeight || imgElement.clientHeight || 0;

    // 获取图片的原始尺寸
    const naturalWidth = imgElement.naturalWidth || 0;
    const naturalHeight = imgElement.naturalHeight || 0;

    console.log('📏 图片尺寸信息:', {
        display: { width: displayWidth, height: displayHeight },
        natural: { width: naturalWidth, height: naturalHeight },
        imageSrc: imgElement.src ? imgElement.src.substring(0, 50) + '...' : 'no src'
    });

    // 计算缩放比例（添加防护检查，避免NaN和0值）
    let scaleX = 1;
    let scaleY = 1;

    if (naturalWidth > 0 && displayWidth > 0 && !isNaN(naturalWidth) && !isNaN(displayWidth)) {
        scaleX = displayWidth / naturalWidth;
        console.log(`  📐 宽度缩放比例: ${displayWidth} / ${naturalWidth} = ${scaleX.toFixed(4)}`);
    } else {
        console.warn('⚠️ 图片宽度参数无效，使用默认缩放比例:', { naturalWidth, displayWidth });
    }

    if (naturalHeight > 0 && displayHeight > 0 && !isNaN(naturalHeight) && !isNaN(displayHeight)) {
        scaleY = displayHeight / naturalHeight;
        console.log(`  📐 高度缩放比例: ${displayHeight} / ${naturalHeight} = ${scaleY.toFixed(4)}`);
    } else {
        console.warn('⚠️ 图片高度参数无效，使用默认缩放比例:', { naturalHeight, displayHeight });
    }

    // 检查缩放比例合理性
    if (scaleX < 0.01 || scaleX > 10 || isNaN(scaleX)) {
        console.warn('⚠️ 宽度缩放比例异常，使用默认值1:', scaleX);
        scaleX = 1;
    }
    if (scaleY < 0.01 || scaleY > 10 || isNaN(scaleY)) {
        console.warn('⚠️ 高度缩放比例异常，使用默认值1:', scaleY);
        scaleY = 1;
    }

    // 获取容器的位置偏移（修复计算方法）
    let offsetX = 0;
    let offsetY = 0;

    try {
        const rect = imgElement.getBoundingClientRect();
        const containerRect = imgElement.parentElement ? imgElement.parentElement.getBoundingClientRect() : rect;

        offsetX = rect.left - containerRect.left;
        offsetY = rect.top - containerRect.top;

        console.log(`  📍 容器偏移量: offsetX=${offsetX.toFixed(2)}, offsetY=${offsetY.toFixed(2)}`);
    } catch (error) {
        console.warn('⚠️ 计算容器偏移量失败，使用默认值:', error.message);
    }

    const result = {
        scaleX: scaleX,
        scaleY: scaleY,
        offsetX: offsetX,
        offsetY: offsetY,
        displayWidth: displayWidth,
        displayHeight: displayHeight,
        naturalWidth: naturalWidth,
        naturalHeight: naturalHeight
    };

    console.log('✅ 缩放信息计算完成:', {
        scaleX: result.scaleX.toFixed(4),
        scaleY: result.scaleY.toFixed(4),
        offsetX: result.offsetX.toFixed(2),
        offsetY: result.offsetY.toFixed(2)
    });

    return result;
}

// 高亮文本框
function highlightTextBox(index) {
    const textBoxes = document.querySelectorAll('.ocr-text-box');
    textBoxes.forEach(box => {
        box.style.borderWidth = '2px';
        box.style.borderColor = 'var(--primary)';
        box.style.transform = 'scale(1)';
    });

    const targetBox = document.querySelector(`.ocr-text-box[data-index="${index}"]`);
    if (targetBox) {
        targetBox.style.borderWidth = '3px';
        targetBox.style.borderColor = '#ff6b6b';
        targetBox.style.transform = 'scale(1.05)';
        targetBox.style.zIndex = '1000';
    }
}

// 高亮文本块列表项
function highlightBlockItem(index) {
    const blockItems = document.querySelectorAll('.text-block-item');
    blockItems.forEach(item => {
        item.classList.remove('highlighted');
    });

    const targetItem = document.querySelector(`.text-block-item[data-index="${index}"]`);
    if (targetItem) {
        targetItem.classList.add('highlighted');
        targetItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// ========== 智能标注功能 ==========

// 全局变量存储当前标注模式
let currentAnnotationMode = 'text-blocks'; // 'text-blocks' 或 'intelligent-annotation'

// 计算编辑距离（用于模糊匹配）
function calculateEditDistance(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));

    for (let i = 0; i <= len1; i++) {
        matrix[0][i] = i;
    }

    for (let j = 0; j <= len2; j++) {
        matrix[j][0] = j;
    }

    for (let j = 1; j <= len2; j++) {
        for (let i = 1; i <= len1; i++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,     // deletion
                matrix[j - 1][i] + 1,     // insertion
                matrix[j - 1][i - 1] + cost // substitution
            );
        }
    }

    return matrix[len2][len1];
}

// 计算相似度（0-1之间）
function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;

    // 预处理：转小写、去除标点符号和多余空格
    const normalize = (s) => s.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const norm1 = normalize(str1);
    const norm2 = normalize(str2);

    if (!norm1 || !norm2) return 0;

    // 方法1：编辑距离相似度
    const editDist = calculateEditDistance(norm1, norm2);
    const maxLen = Math.max(norm1.length, norm2.length);
    const editSimilarity = 1 - (editDist / maxLen);

    // 方法2：词汇重叠相似度
    const words1 = new Set(norm1.split(' '));
    const words2 = new Set(norm2.split(' '));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    const wordSimilarity = intersection.size / union.size;

    // 方法3：最长公共子序列相似度
    const lcsLength = calculateLCSLength(norm1, norm2);
    const lcsSimilarity = (2 * lcsLength) / (norm1.length + norm2.length);

    // 综合三种方法的相似度
    const combinedSimilarity = (editSimilarity * 0.4 + wordSimilarity * 0.4 + lcsSimilarity * 0.2);

    return combinedSimilarity;
}

// 计算最长公共子序列长度
function calculateLCSLength(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    return dp[m][n];
}

// 将智能标注与OCR文本块匹配
function matchAnnotationToOCRBlocks(annotationData, ocrBlocks) {
    const matches = {
        nice_sentence: [],
        good_sentence: [],
        improve_sentence: []
    };

    // 匹配精彩表达
    if (annotationData.nice_sentence && Array.isArray(annotationData.nice_sentence)) {
        matches.nice_sentence = annotationData.nice_sentence.map(sentence => {
            const bestMatch = findBestMatch(sentence.text, ocrBlocks);
            return {
                ...sentence,
                ocrIndex: bestMatch.ocrIndex,           // 兼容旧代码：第一个索引
                ocrIndexes: bestMatch.ocrIndexes,        // 新字段：多索引数组
                similarity: bestMatch.similarity,
                matchedText: bestMatch.matchedText,
                boundingBox: bestMatch.boundingBox,      // 新字段：联合边界框
                isMultiBlock: bestMatch.isMultiBlock      // 新字段：是否多块匹配
            };
        });
    }

    // 匹配良好表达
    if (annotationData.good_sentence && Array.isArray(annotationData.good_sentence)) {
        matches.good_sentence = annotationData.good_sentence.map(sentence => {
            const bestMatch = findBestMatch(sentence.text, ocrBlocks);
            return {
                ...sentence,
                ocrIndex: bestMatch.ocrIndex,
                ocrIndexes: bestMatch.ocrIndexes,
                similarity: bestMatch.similarity,
                matchedText: bestMatch.matchedText,
                boundingBox: bestMatch.boundingBox,
                isMultiBlock: bestMatch.isMultiBlock
            };
        });
    }

    // 匹配待改进表达
    if (annotationData.improve_sentence && Array.isArray(annotationData.improve_sentence)) {
        matches.improve_sentence = annotationData.improve_sentence.map(sentence => {
            const bestMatch = findBestMatch(sentence.text, ocrBlocks);
            return {
                ...sentence,
                ocrIndex: bestMatch.ocrIndex,
                ocrIndexes: bestMatch.ocrIndexes,
                similarity: bestMatch.similarity,
                matchedText: bestMatch.matchedText,
                boundingBox: bestMatch.boundingBox,
                isMultiBlock: bestMatch.isMultiBlock
            };
        });
    }

    return matches;
}

// 查找最佳匹配
function findBestMatch(targetText, ocrBlocks) {
    // 首先尝试多块匹配（适用于长句子跨多行的情况）
    console.log(`🔍 开始匹配文本: "${targetText}" (长度: ${targetText.length})`);

    // 使用滑动窗口查找最佳多块匹配
    const multiBlockMatch = findBestMultiBlockMatch(targetText, ocrBlocks, 5);

    console.log(`🔍 多块匹配结果:`, {
        similarity: multiBlockMatch.similarity.toFixed(3),
        indexes: multiBlockMatch.indexes,
        text: multiBlockMatch.text.substring(0, 50) + '...',
        bbox: multiBlockMatch.boundingBox
    });

    // 如果多块匹配效果不好，再尝试单块匹配作为备选
    let singleBlockMatch = {
        index: -1,
        similarity: 0,
        text: ''
    };

    ocrBlocks.forEach((block, index) => {
        const blockText = (block.text || block.content || '').trim();
        const similarity = calculateSimilarity(targetText, blockText);

        if (similarity > singleBlockMatch.similarity) {
            singleBlockMatch = {
                index: index,
                similarity: similarity,
                text: blockText
            };
        }
    });

    console.log(`🔍 单块匹配结果:`, {
        similarity: singleBlockMatch.similarity.toFixed(3),
        index: singleBlockMatch.index,
        text: singleBlockMatch.text.substring(0, 50) + '...'
    });

    // 选择最佳匹配（优先选择多块匹配，除非单块匹配明显更好）
    let bestMatch;
    if (multiBlockMatch.similarity > singleBlockMatch.similarity * 1.1) {
        bestMatch = {
            ocrIndexes: multiBlockMatch.indexes,  // 多块索引数组
            ocrIndex: multiBlockMatch.indexes[0], // 兼容旧代码，返回第一个索引
            similarity: multiBlockMatch.similarity,
            text: multiBlockMatch.text,
            matchedText: multiBlockMatch.text,
            boundingBox: multiBlockMatch.boundingBox,
            isMultiBlock: true
        };
        console.log(`✅ 最佳匹配: 多块匹配 (相似度: ${bestMatch.similarity.toFixed(3)})`);
    } else {
        bestMatch = {
            ocrIndexes: singleBlockMatch.index >= 0 ? [singleBlockMatch.index] : [],
            ocrIndex: singleBlockMatch.index,
            similarity: singleBlockMatch.similarity,
            text: singleBlockMatch.text,
            matchedText: singleBlockMatch.text,
            boundingBox: singleBlockMatch.index >= 0 ? {
                x: getBoxCoordinates(ocrBlocks[singleBlockMatch.index])[0],
                y: getBoxCoordinates(ocrBlocks[singleBlockMatch.index])[1],
                w: getBoxCoordinates(ocrBlocks[singleBlockMatch.index])[2],
                h: getBoxCoordinates(ocrBlocks[singleBlockMatch.index])[3]
            } : null,
            isMultiBlock: false
        };
        console.log(`✅ 最佳匹配: 单块匹配 (相似度: ${bestMatch.similarity.toFixed(3)})`);
    }

    return bestMatch;
}

// 显示智能标注（增强版showOCRVisualization）
function showIntelligentAnnotation(annotationData, ocrBlocks, scaleInfo = null) {
    const ocrVisualization = document.getElementById('ocrVisualization');
    const blocksContainer = document.getElementById('blocksContainer');
    const blockCountSpan = document.getElementById('blockCount');
    const imageWithBoxes = document.getElementById('imageWithBoxes');

    if (!ocrVisualization || !annotationData || !ocrBlocks || ocrBlocks.length === 0) {
        console.log('智能标注参数不完整，无法显示');
        return;
    }

    // 匹配标注与OCR块
    const matches = matchAnnotationToOCRBlocks(annotationData, ocrBlocks);

    // 清空之前的列表项
    blocksContainer.innerHTML = '';

    // 清空之前的文本框
    const existingBoxes = document.querySelectorAll('.ocr-text-box');
    existingBoxes.forEach(box => box.remove());

    // 添加智能标注图例
    addAnnotationLegend(blocksContainer);

    // 创建颜色映射
    const colorMap = {
        'nice_sentence': { color: '#4caf50', label: '精彩表达', icon: '✨' },
        'good_sentence': { color: '#2196f3', label: '良好表达', icon: '👍' },
        'improve_sentence': { color: '#f44336', label: '待改进', icon: '⚠️' }
    };

    // 统计智能标注数量
    let annotationCount = 0;

    // 遍历所有匹配的标注
    Object.entries(matches).forEach(([type, sentences]) => {
        const config = colorMap[type];
        if (!config || !Array.isArray(sentences)) return;

        sentences.forEach((sentence, index) => {
            // 只显示相似度大于阈值的匹配（容忍OCR错误）
            if (sentence.similarity >= 0.3 && sentence.ocrIndex >= 0) {
                annotationCount++;
                // 添加到列表
                const listItem = createAnnotationListItem(sentence, config, type, sentence.ocrIndex);
                blocksContainer.appendChild(listItem);
                // ⚠️ 注意：不在缩略图上添加智能标注框，只在弹窗中显示
            }
        });
    });

    // 更新智能标注计数
    if (blockCountSpan) {
        blockCountSpan.textContent = annotationCount;
    }

    // 显示可视化区域
    ocrVisualization.style.display = 'block';
}

// 创建智能标注列表项
function createAnnotationListItem(sentence, config, type, ocrIndex) {
    const item = document.createElement('div');
    item.className = 'annotation-item';
    item.dataset.index = ocrIndex;  // 统一使用data-index属性
    item.dataset.type = type;

    const similarityPercent = (sentence.similarity * 100).toFixed(1);

    item.innerHTML = `
        <div class="annotation-header">
            <span class="annotation-icon">${config.icon}</span>
            <span class="annotation-label">${config.label}</span>
            <span class="annotation-similarity">匹配度: ${similarityPercent}%</span>
        </div>
        <div class="annotation-text">${escapeHtml(sentence.text)}</div>
        ${sentence.nice_reason || sentence.good_reason || sentence.improve_reason
            ? `<div class="annotation-reason">${escapeHtml(sentence.nice_reason || sentence.good_reason || sentence.improve_reason)}</div>`
            : ''}
        <div class="annotation-match">匹配文本: ${escapeHtml(sentence.matchedText || '')}</div>
    `;

    // 点击高亮对应的图片区域
    item.addEventListener('click', () => {
        highlightTextBox(ocrIndex);
        highlightBlockItem(ocrIndex);
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    return item;
}

// 在图片上添加智能标注框
function addAnnotationBox(sentence, config, ocrIndex, scaleInfo = null) {
    const imageWithBoxes = document.getElementById('imageWithBoxes');
    const boxesImg = document.getElementById('boxesImg');

    if (!imageWithBoxes || !boxesImg || ocrIndex < 0) return;

    // 如果有缩放信息，直接基于坐标创建标注框
    if (scaleInfo) {
        const boxesData = window.ocrResultData?.boxes_data || [];
        if (boxesData[ocrIndex]) {
            const box = boxesData[ocrIndex];
            const coords = getBoxCoordinates(box);
            if (coords) {
                let [x, y, w, h] = coords;

                // 应用缩放
                x = x * scaleInfo.scaleX;
                y = y * scaleInfo.scaleY;
                w = w * scaleInfo.scaleX;
                h = h * scaleInfo.scaleY;

                // 创建智能标注框
                const annotationBox = document.createElement('div');
                annotationBox.className = `ocr-text-box annotation-box ${sentence.type || ''}`;
                annotationBox.dataset.index = ocrIndex;
                annotationBox.dataset.annotationType = sentence.type || '';
                annotationBox.style.position = 'absolute';
                annotationBox.style.left = x + 'px';
                annotationBox.style.top = y + 'px';
                annotationBox.style.width = w + 'px';
                annotationBox.style.height = h + 'px';
                annotationBox.style.border = `3px solid ${config.color}`;
                annotationBox.style.backgroundColor = `${config.color}20`;
                annotationBox.style.boxShadow = `0 0 10px ${config.color}40`;
                annotationBox.style.cursor = 'pointer';
                annotationBox.style.zIndex = '1000';

                // 添加悬浮提示
                annotationBox.title = `${config.label}: ${sentence.text}`;

                // 添加图标标签
                const label = document.createElement('div');
                label.className = 'box-label';
                label.textContent = config.icon;
                label.style.backgroundColor = config.color;
                annotationBox.appendChild(label);

                // 添加文本提示
                const boxText = document.createElement('div');
                boxText.className = 'box-text';
                boxText.textContent = (sentence.text || '').substring(0, 15);
                annotationBox.appendChild(boxText);

                // 添加点击事件
                annotationBox.addEventListener('click', () => {
                    highlightBlockItem(ocrIndex);
                    highlightTextBox(ocrIndex);
                });

                imageWithBoxes.appendChild(annotationBox);
                return;
            }
        }
    }

    // 备用方案：基于现有文本框创建（兼容旧逻辑）
    const originalBox = document.querySelector(`.ocr-text-box[data-index="${ocrIndex}"]`);
    if (!originalBox) return;

    // 复制样式并添加智能标注样式
    const annotationBox = originalBox.cloneNode(true);
    annotationBox.className = `ocr-text-box annotation-box ${sentence.type || ''}`;
    annotationBox.dataset.index = ocrIndex;
    annotationBox.dataset.annotationType = sentence.type || '';

    // 应用智能标注样式
    annotationBox.style.border = `3px solid ${config.color}`;
    annotationBox.style.backgroundColor = `${config.color}20`;
    annotationBox.style.boxShadow = `0 0 10px ${config.color}40`;

    // 添加悬浮提示
    annotationBox.title = `${config.label}: ${sentence.text}`;

    // 更新标签
    const label = annotationBox.querySelector('.box-label');
    if (label) {
        label.textContent = config.icon;
        label.style.backgroundColor = config.color;
    }

    // 更新文本
    const boxText = annotationBox.querySelector('.box-text');
    if (boxText) {
        boxText.textContent = (sentence.text || '').substring(0, 15);
    }

    // 移除原来的文本框，避免重复
    originalBox.remove();

    // 添加到图片容器
    imageWithBoxes.appendChild(annotationBox);
}

// 添加智能标注图例
function addAnnotationLegend(container) {
    const legend = document.createElement('div');
    legend.className = 'annotation-legend';
    legend.innerHTML = `
        <h4><i class="fas fa-layer-group"></i> 智能标注图例</h4>
        <div class="legend-items">
            <div class="legend-item">
                <span class="legend-color" style="background: #4caf50;"></span>
                <span>✨ 精彩表达</span>
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background: #2196f3;"></span>
                <span>👍 良好表达</span>
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background: #f44336;"></span>
                <span>⚠️ 待改进</span>
            </div>
        </div>
    `;
    container.appendChild(legend);
}

// 显示OCR文本块（原始模式）
function showOCRTextBlocks(boxesData, scaleInfo = null) {
    const ocrVisualization = document.getElementById('ocrVisualization');
    const blocksContainer = document.getElementById('blocksContainer');
    const blockCountSpan = document.getElementById('blockCount');

    if (!ocrVisualization || !boxesData || boxesData.length === 0) {
        return;
    }

    // 清除之前的内容
    blocksContainer.innerHTML = '';

    // 清空图片上的文本框
    const existingBoxes = document.querySelectorAll('.ocr-text-box');
    existingBoxes.forEach(box => box.remove());

    // 更新文本块计数
    if (blockCountSpan) {
        blockCountSpan.textContent = boxesData.length;
    }

    // 添加文本块到列表（不在缩略图上显示文本框）
    boxesData.forEach((box, index) => {
        const blockItem = createTextBlockItem(box, index);
        blocksContainer.appendChild(blockItem);
        // ⚠️ 注意：不在缩略图上添加文本框，只在弹窗中显示
    });

    // 显示可视化区域
    ocrVisualization.style.display = 'block';
}

// 更新showOCRVisualization函数以支持模式切换
const originalShowOCRVisualization = showOCRVisualization;
showOCRVisualization = function(boxesData, annotationData) {
    // 清除之前的切换按钮
    const existingToggle = document.querySelector('.annotation-mode-toggle');
    if (existingToggle) {
        existingToggle.remove();
    }

    // 查找容器
    const ocrVisualization = document.getElementById('ocrVisualization');
    const visualizationContent = document.querySelector('.visualization-content');

    if (!ocrVisualization || !visualizationContent) {
        originalShowOCRVisualization(boxesData);
        return;
    }

    // 只在有智能标注数据时显示模式切换按钮
    if (annotationData) {
        // 添加模式切换按钮
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'annotation-mode-toggle';
        toggleContainer.innerHTML = `
            <button class="mode-btn active" data-mode="text-blocks">
                <i class="fas fa-list"></i> 文本块视图
            </button>
            <button class="mode-btn" data-mode="intelligent-annotation">
                <i class="fas fa-layer-group"></i> 智能标注视图
            </button>
        `;

        // 插入到可视化内容区域顶部
        visualizationContent.insertBefore(toggleContainer, visualizationContent.firstChild);

        // 添加模式切换事件
        const modeBtns = toggleContainer.querySelectorAll('.mode-btn');
        modeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                modeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const mode = btn.dataset.mode;
                currentAnnotationMode = mode;

                // 获取图片缩放信息（增加图片加载检查）
                const boxesImg = document.getElementById('boxesImg');
                let scaleInfo = null;
                if (boxesImg) {
                    // 检查图片是否完全加载
                    if (boxesImg.naturalWidth > 0 && boxesImg.naturalHeight > 0) {
                        console.log('✅ 图片已加载，计算缩放比例');
                        scaleInfo = getImageScaleInfo(boxesImg, boxesData);
                    } else {
                        console.warn('⚠️ 图片未完全加载，等待后重试...');
                        // 等待图片加载完成
                        const checkAndProcess = () => {
                            if (boxesImg.naturalWidth > 0 && boxesImg.naturalHeight > 0) {
                                scaleInfo = getImageScaleInfo(boxesImg, boxesData);
                                console.log('✅ 图片加载完成，重新计算缩放比例:', scaleInfo);
                                if (mode === 'text-blocks') {
                                    showOCRTextBlocks(boxesData, scaleInfo);
                                } else if (mode === 'intelligent-annotation') {
                                    showIntelligentAnnotation(annotationData, boxesData, scaleInfo);
                                }
                            } else {
                                setTimeout(checkAndProcess, 100);
                            }
                        };
                        setTimeout(checkAndProcess, 100);
                        return; // 提前返回，避免重复执行
                    }
                }

                if (mode === 'text-blocks') {
                    showOCRTextBlocks(boxesData, scaleInfo);
                } else if (mode === 'intelligent-annotation') {
                    showIntelligentAnnotation(annotationData, boxesData, scaleInfo);
                }
            });
        });
    }

    // 默认显示文本块视图
    showOCRTextBlocks(boxesData);
};

// ========== 批改结果页面的智能标注显示 ==========

// 创建基础的OCR文本框（作为智能标注的载体）
function createBaseOcrBox(container, box, index) {
    const coords = getBoxCoordinates(box);
    if (!coords) return;

    const [x, y, w, h] = coords;

    // 创建基础文本框（透明边框，不显示）
    const textBox = document.createElement('div');
    textBox.className = 'ocr-text-box';
    textBox.dataset.index = index;
    textBox.style.position = 'absolute';
    textBox.style.left = x + 'px';
    textBox.style.top = y + 'px';
    textBox.style.width = w + 'px';
    textBox.style.height = h + 'px';
    textBox.style.border = '1px solid transparent';
    textBox.style.background = 'transparent';
    textBox.style.pointerEvents = 'none';
    textBox.style.zIndex = '1'; // 设置低z-index，不会遮挡智能标注框

    container.appendChild(textBox);
}

// 基于OCR坐标直接创建智能标注框
function addResultAnnotationBoxByCoords(sentence, config, ocrIndex, boxesData, scaleInfo = null, container = null) {
    // 如果没有指定容器，使用默认的批改结果页面容器
    const imageWithBoxes = container || document.getElementById('resultImageWithBoxes');
    if (!imageWithBoxes) return;

    // 支持多块匹配：如果sentence包含ocrIndexes，使用联合边界框
    let bbox = null;
    let ocrIndexes = [];

    if (sentence.boundingBox) {
        // 如果已有联合边界框，直接使用
        console.log(`  📦 使用已计算的联合边界框:`, sentence.boundingBox);
        bbox = sentence.boundingBox;
        ocrIndexes = sentence.ocrIndexes || [ocrIndex];
    } else if (sentence.ocrIndexes && sentence.ocrIndexes.length > 1) {
        // 如果有多个OCR索引但没有边界框，计算联合边界框
        console.log(`  📦 计算 ${sentence.ocrIndexes.length} 个OCR块的联合边界框`);
        ocrIndexes = sentence.ocrIndexes;
        bbox = calculateMergedBoundingBox(boxesData, ocrIndexes);
    } else if (ocrIndex >= 0 && boxesData[ocrIndex]) {
        // 单块情况
        console.log(`  📦 处理单个OCR块 ${ocrIndex}:`, { text: boxesData[ocrIndex].text?.substring(0, 30) });
        ocrIndexes = [ocrIndex];
        bbox = null;  // 将从coords计算
    } else {
        console.log(`  ⚠️ 没有有效的OCR索引或边界框`);
        return;
    }

    let coords = null;
    let [x, y, w, h] = [0, 0, 0, 0];

    if (!bbox) {
        // 使用单个OCR块的坐标
        const box = boxesData[ocrIndex];
        console.log(`  📐 OCR块 ${ocrIndex} 原始坐标:`, coords);
        coords = getBoxCoordinates(box);
        if (!coords) {
            console.log(`  ⚠️ OCR块 ${ocrIndex} 没有坐标信息`);
            return;
        }
        [x, y, w, h] = coords;
    } else {
        // 使用联合边界框的坐标
        console.log(`  📐 联合边界框坐标:`, bbox);
        x = bbox.x;
        y = bbox.y;
        w = bbox.w;
        h = bbox.h;
    }

    // 确保坐标是数字类型
    x = Number(x);
    y = Number(y);
    w = Number(w);
    h = Number(h);

    console.log(`  🔢 原始坐标值检查:`, {
        x: { value: x, type: typeof x, isNaN: isNaN(x) },
        y: { value: y, type: typeof y, isNaN: isNaN(y) },
        w: { value: w, type: typeof w, isNaN: isNaN(w) },
        h: { value: h, type: typeof h, isNaN: isNaN(h) }
    });

    // 如果提供了缩放信息，则转换坐标
    if (scaleInfo) {
        // 检查缩放比例有效性
        if (isNaN(scaleInfo.scaleX) || isNaN(scaleInfo.scaleY) || scaleInfo.scaleX <= 0 || scaleInfo.scaleY <= 0) {
            console.warn('⚠️ 无效的缩放比例，跳过坐标转换:', scaleInfo);
        } else {
            const origX = x, origY = y, origW = w, origH = h;
            x = x * scaleInfo.scaleX;
            y = y * scaleInfo.scaleY;
            w = w * scaleInfo.scaleX;
            h = h * scaleInfo.scaleY;

            // 应用容器偏移量（如果存在）
            if (scaleInfo.offsetX !== undefined && scaleInfo.offsetY !== undefined) {
                x = x + scaleInfo.offsetX;
                y = y + scaleInfo.offsetY;
                console.log(`  📍 应用容器偏移量: offsetX=${scaleInfo.offsetX.toFixed(1)}, offsetY=${scaleInfo.offsetY.toFixed(1)}`);
            }

            console.log(`  ➡️ 坐标转换详细:`, {
                from: { x: origX, y: origY, w: origW, h: origH },
                scale: { scaleX: scaleInfo.scaleX, scaleY: scaleInfo.scaleY },
                offset: { offsetX: scaleInfo.offsetX, offsetY: scaleInfo.offsetY },
                to: { x, y, w, h }
            });
        }

        console.log(`  转换坐标: [${x}, ${y}, ${w}, ${h}] (缩放比例: ${scaleInfo.scaleX.toFixed(3)}, ${scaleInfo.scaleY.toFixed(3)})`);
    }

    // 检查坐标有效性
    if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) {
        console.error('❌ 坐标包含NaN，跳过添加标注框:', { x, y, w, h, ocrIndex });
        return;
    }

    // 确保坐标为正值
    x = Math.max(0, x);
    y = Math.max(0, y);
    w = Math.max(1, w);
    h = Math.max(1, h);

    // 创建智能标注框
    const annotationBox = document.createElement('div');
    annotationBox.className = 'ocr-text-box annotation-box';
    annotationBox.dataset.index = ocrIndex;
    annotationBox.dataset.annotationType = sentence.type || '';
    annotationBox.style.position = 'absolute';
    annotationBox.style.left = x + 'px';
    annotationBox.style.top = y + 'px';
    annotationBox.style.width = w + 'px';
    annotationBox.style.height = h + 'px';
    annotationBox.style.border = `3px solid ${config.color}`;
    annotationBox.style.backgroundColor = `${config.color}20`;
    annotationBox.style.boxShadow = `0 0 10px ${config.color}40`;
    annotationBox.style.cursor = 'pointer';
    annotationBox.style.zIndex = '1000'; // 设置高z-index防止重叠
    annotationBox.style.pointerEvents = 'auto';

    // 添加悬浮提示
    annotationBox.title = `${config.label}: ${sentence.text}`;

    // 添加图标标签
    const label = document.createElement('div');
    label.className = 'box-label';
    label.textContent = config.icon;
    label.style.backgroundColor = config.color;
    annotationBox.appendChild(label);

    // 添加文本提示
    const boxText = document.createElement('div');
    boxText.className = 'box-text';
    boxText.textContent = (sentence.text || '').substring(0, 20);
    boxText.style.backgroundColor = config.color;
    annotationBox.appendChild(boxText);

    // 添加点击事件（高亮对应的列表项）
    annotationBox.addEventListener('click', () => {
        // 优先在当前容器中查找，如果没有则在全局查找
        let listItem = document.querySelector(`#resultBlocksContainer .annotation-item[data-index="${ocrIndex}"]`);
        if (!listItem) {
            listItem = document.querySelector(`#modalBlocksContainer .annotation-item[data-index="${ocrIndex}"]`);
        }

        if (listItem) {
            // 移除所有其他项的高亮（在所有容器中）
            document.querySelectorAll('#resultBlocksContainer .annotation-item, #modalBlocksContainer .annotation-item').forEach(item => {
                item.classList.remove('highlighted');
            });
            // 高亮当前项
            listItem.classList.add('highlighted');
        }
    });

    // 如果是多块匹配，添加额外的视觉提示
    if (ocrIndexes.length > 1) {
        console.log(`  🎨 检测到多块匹配，为每个子块创建辅助标注框`);

        // 创建主标注框（覆盖整个联合区域）
        annotationBox.classList.add('multi-block-annotation');
        annotationBox.style.borderWidth = '3px';
        annotationBox.style.borderStyle = 'solid';

        // 为每个子块创建辅助标注框
        ocrIndexes.forEach((idx, i) => {
            const subCoords = getBoxCoordinates(boxesData[idx]);
            if (!subCoords) return;

            let [sx, sy, sw, sh] = subCoords;

            // 缩放和偏移转换
            if (scaleInfo) {
                sx = sx * scaleInfo.scaleX + (scaleInfo.offsetX || 0);
                sy = sy * scaleInfo.scaleY + (scaleInfo.offsetY || 0);
                sw = sw * scaleInfo.scaleX;
                sh = sh * scaleInfo.scaleY;
            }

            const subBox = document.createElement('div');
            subBox.className = 'ocr-text-box annotation-box sub-block';
            subBox.dataset.index = idx;
            subBox.style.position = 'absolute';
            subBox.style.left = sx + 'px';
            subBox.style.top = sy + 'px';
            subBox.style.width = sw + 'px';
            subBox.style.height = sh + 'px';
            subBox.style.border = `2px dashed ${config.color}80`;
            subBox.style.backgroundColor = `${config.color}10`;
            subBox.style.pointerEvents = 'none';  // 子框不响应点击事件
            subBox.style.zIndex = '999';  // 子框z-index稍低

            imageWithBoxes.appendChild(subBox);
        });

        console.log(`  ✅ 多块智能标注完成，主框+${ocrIndexes.length - 1}个子框`);
    }

    imageWithBoxes.appendChild(annotationBox);
    console.log(`  ✅ 智能标注框已添加 (${config.icon}), 位置: (${x.toFixed(1)}, ${y.toFixed(1)}), 大小: ${w.toFixed(1)}x${h.toFixed(1)}, OCR索引: ${ocrIndexes.join(', ')}`);
}

// 在批改结果页面显示智能标注
function showResultAnnotation(boxesData, annotationData) {
    console.log('🎯 showResultAnnotation 被调用');
    console.log('boxesData:', boxesData);
    console.log('annotationData:', annotationData);

    const resultAnnotationSection = document.getElementById('resultAnnotationSection');
    const resultBoxesImg = document.getElementById('resultBoxesImg');
    const resultBlocksContainer = document.getElementById('resultBlocksContainer');
    const resultBlockCountSpan = document.getElementById('resultBlockCount');

    if (!resultAnnotationSection) {
        console.log('⚠️ 智能标注容器不存在');
        return;
    }

    // 如果没有OCR数据但有智能标注数据,显示纯文本模式的智能标注
    if (!boxesData || boxesData.length === 0) {
        console.log('⚠️ 没有OCR坐标数据');
        if (annotationData && (annotationData.nice_sentence?.length > 0 ||
            annotationData.good_sentence?.length > 0 ||
            annotationData.improve_sentence?.length > 0)) {
            console.log('✅ 有智能标注数据,显示纯文本模式');
            showTextOnlyAnnotation(annotationData);
            return;
        } else {
            console.log('⚠️ 也没有智能标注数据，显示占位状态');
            showEmptyAnnotationState();
            return;
        }
    }

    // 获取原始图片 - 优先使用全局保存的OCR图片数据
    if (window.currentOCRImageData) {
        resultBoxesImg.src = window.currentOCRImageData;
        console.log('✅ 使用全局保存的OCR图片数据');
    } else {
        // 备用方案：从previewImg获取
        const previewImg = document.getElementById('previewImg');
        if (previewImg && previewImg.src && previewImg.src !== '') {
            resultBoxesImg.src = previewImg.src;
            console.log('✅ 使用previewImg的图片数据');
        } else {
            console.log('⚠️ 未找到原始图片，显示占位状态');
            showEmptyAnnotationState();
            return;
        }
    }

    // 清空之前的标注框和列表
    const imageContainer = document.querySelector('.result-image-panel .image-container');
    const existingBoxes = imageContainer ? imageContainer.querySelectorAll('.ocr-text-box, .annotation-box') : [];
    existingBoxes.forEach(box => box.remove());
    resultBlocksContainer.innerHTML = '';

    // 定义处理智能标注的函数，避免重复调用
    const processAnnotation = function() {
        console.log('📝 批改结果图片加载完成，开始添加智能标注');

        // 双重检查图片尺寸
        if (!resultBoxesImg.naturalWidth || !resultBoxesImg.naturalHeight) {
            console.warn('⚠️ 图片尺寸未就绪，延迟执行...');
            setTimeout(processAnnotation, 500); // 增加延迟到500ms
            return;
        }

        // 获取图片的显示尺寸比例
        const scaleInfo = getImageScaleInfo(resultBoxesImg, boxesData);
        console.log('🔍 批改结果图片缩放信息:', scaleInfo);

        // 如果缩放比例为NaN，使用默认值
        if (isNaN(scaleInfo.scaleX) || isNaN(scaleInfo.scaleY) || scaleInfo.scaleX <= 0 || scaleInfo.scaleY <= 0) {
            console.warn('⚠️ 缩放比例无效，使用默认值1');
            scaleInfo.scaleX = 1;
            scaleInfo.scaleY = 1;
        }

        // 如果有智能标注数据，显示智能标注
        if (annotationData) {
            console.log('✅ 匹配智能标注到OCR文本块');
            const matches = matchAnnotationToOCRBlocks(annotationData, boxesData);

            // 创建颜色映射
            const colorMap = {
                'nice_sentence': { color: '#4caf50', label: '精彩表达', icon: '✨' },
                'good_sentence': { color: '#2196f3', label: '良好表达', icon: '👍' },
                'improve_sentence': { color: '#f44336', label: '待改进', icon: '⚠️' }
            };

            // 添加智能标注图例
            const legend = document.createElement('div');
            legend.className = 'annotation-legend';
            legend.innerHTML = `
                <h4><i class="fas fa-layer-group"></i> 智能标注图例</h4>
                <div class="legend-items">
                    <div class="legend-item">
                        <span class="legend-color" style="background: #4caf50;"></span>
                        <span>✨ 精彩表达</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #2196f3;"></span>
                        <span>👍 良好表达</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #f44336;"></span>
                        <span>⚠️ 待改进</span>
                    </div>
                </div>
            `;
            resultBlocksContainer.appendChild(legend);

            // 为了避免颜色重叠，每个OCR块只显示一个最重要的标注
            const ocrIndexToBestSentence = {};

            // 标注类型优先级（数值越大优先级越高）
            const getTypePriority = (type) => {
                const priorities = {
                    'nice_sentence': 3,     // 精彩表达优先级最高
                    'good_sentence': 2,     // 良好表达次之
                    'improve_sentence': 1   // 待改进优先级最低
                };
                return priorities[type] || 0;
            };

            // 先找出每个OCR块的最佳匹配（优先级：精彩表达 > 良好表达 > 待改进）
            Object.entries(matches).forEach(([type, sentences]) => {
                const config = colorMap[type];
                if (!config || !Array.isArray(sentences)) return;

                sentences.forEach(sentence => {
                    // 只显示相似度大于阈值的匹配（容忍OCR错误）
                    if (sentence.similarity >= 0.3 && sentence.ocrIndex >= 0) {
                        // 如果这个OCR块还没有标注，或者当前标注优先级更高，则更新
                        const current = ocrIndexToBestSentence[sentence.ocrIndex];
                        if (!current || getTypePriority(type) > getTypePriority(current.type)) {
                            ocrIndexToBestSentence[sentence.ocrIndex] = {
                                sentence: sentence,
                                config: config,
                                type: type
                            };
                        }
                    }
                });
            });

            // 然后显示每个OCR块的最佳标注
            let hasAnnotations = false;
            let annotationCount = 0;
            const processedIndexes = new Set(); // 用于跟踪已处理的OCR索引，避免重复
            Object.entries(ocrIndexToBestSentence).forEach(([ocrIndex, data]) => {
                const sentence = data.sentence;
                const config = data.config;
                const type = data.type;

                // 防止重复添加相同OCR索引的标注
                const indexKey = `${sentence.ocrIndex}-${type}`;
                if (processedIndexes.has(indexKey)) {
                    return;
                }
                processedIndexes.add(indexKey);

                hasAnnotations = true;
                annotationCount++;
                // 添加到列表
                const listItem = createResultAnnotationListItem(sentence, config, type, sentence.ocrIndex);
                resultBlocksContainer.appendChild(listItem);
                // 在批改结果页面的图片上添加智能标注框
                addResultAnnotationBoxByCoords(sentence, config, sentence.ocrIndex, boxesData, scaleInfo, imageContainer);
            });

            // 更新智能标注计数
            if (resultBlockCountSpan) {
                resultBlockCountSpan.textContent = annotationCount;
            }

            // 如果有标注，显示标注区域
            if (hasAnnotations) {
                console.log('✅ 批改结果智能标注显示完成（图片+列表）');
            } else {
                console.log('⚠️ 未找到匹配的标注，显示占位状态');
                showEmptyAnnotationState();
            }
        } else {
            console.log('⚠️ 无智能标注数据，显示占位状态');
            showEmptyAnnotationState();
        }
    };

    // 使用标志位防止重复执行
    let isProcessing = false;

    const safeProcessAnnotation = function() {
        if (isProcessing) {
            console.log('⚠️ 正在处理中，跳过重复调用');
            return;
        }
        isProcessing = true;
        processAnnotation();
    };

    // 清除之前的onload事件，避免重复绑定
    resultBoxesImg.onload = null;
    resultBoxesImg.onload = safeProcessAnnotation;

    // 如果图片已经加载完成，立即执行
    if (resultBoxesImg.complete && resultBoxesImg.naturalWidth > 0 && resultBoxesImg.naturalHeight > 0) {
        safeProcessAnnotation();
    } else {
        // 额外等待确保图片渲染完成
        setTimeout(() => {
            if (resultBoxesImg.naturalWidth > 0 && resultBoxesImg.naturalHeight > 0) {
                safeProcessAnnotation();
            } else {
                console.warn('⚠️ 延迟后图片仍未就绪，使用默认处理');
                safeProcessAnnotation();
            }
        }, 500); // 增加延迟到500ms确保图片完全渲染
    }
}

// 显示纯文本模式的智能标注(无OCR坐标)
function showTextOnlyAnnotation(annotationData) {
    const resultAnnotationSection = document.getElementById('resultAnnotationSection');
    const resultBlocksContainer = document.getElementById('resultBlocksContainer');
    const resultBlockCountSpan = document.getElementById('resultBlockCount');

    if (!resultAnnotationSection || !resultBlocksContainer) {
        return;
    }

    // 显示智能标注区域
    resultAnnotationSection.style.display = 'block';

    // 清空容器
    resultBlocksContainer.innerHTML = '';

    // 创建颜色映射
    const colorMap = {
        'nice_sentence': { color: '#4caf50', label: '精彩表达', icon: '✨' },
        'good_sentence': { color: '#2196f3', label: '良好表达', icon: '👍' },
        'improve_sentence': { color: '#f44336', label: '待改进', icon: '⚠️' }
    };

    // 添加提示信息
    const notice = document.createElement('div');
    notice.className = 'annotation-notice';
    notice.innerHTML = `
        <i class="fas fa-info-circle"></i>
        <p>此历史记录不包含OCR坐标数据,仅显示文本标注</p>
    `;
    notice.style.cssText = 'background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 12px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; font-size: 14px; color: #856404;';
    resultBlocksContainer.appendChild(notice);

    // 添加图例
    const legend = document.createElement('div');
    legend.className = 'annotation-legend';
    legend.innerHTML = `
        <h4><i class="fas fa-layer-group"></i> 智能标注图例</h4>
        <div class="legend-items">
            <div class="legend-item">
                <span class="legend-color" style="background: #4caf50;"></span>
                <span>✨ 精彩表达</span>
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background: #2196f3;"></span>
                <span>👍 良好表达</span>
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background: #f44336;"></span>
                <span>⚠️ 待改进</span>
            </div>
        </div>
    `;
    resultBlocksContainer.appendChild(legend);

    let totalCount = 0;

    // 添加各类标注
    ['nice_sentence', 'good_sentence', 'improve_sentence'].forEach(type => {
        const sentences = annotationData[type];
        if (!sentences || sentences.length === 0) return;

        sentences.forEach((sentence, index) => {
            const config = colorMap[type];
            const item = document.createElement('div');
            item.className = 'annotation-item text-only';
            item.style.cssText = `border-left: 4px solid ${config.color}; padding: 12px; margin-bottom: 10px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);`;

            const reasonKey = type === 'nice_sentence' ? 'nice_reason' :
                            type === 'good_sentence' ? 'good_reason' : 'improve_reason';

            item.innerHTML = `
                <div style="display: flex; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 20px; margin-right: 8px;">${config.icon}</span>
                    <strong style="color: ${config.color};">${config.label}</strong>
                </div>
                <div style="padding: 8px; background: #f8f9fa; border-radius: 4px; margin-bottom: 8px;">
                    <div style="color: #333; line-height: 1.6;">"${escapeHtml(sentence.text)}"</div>
                </div>
                <div style="font-size: 13px; color: #666; line-height: 1.5;">
                    <i class="fas fa-comment-dots"></i> ${escapeHtml(sentence[reasonKey] || '无说明')}
                </div>
            `;

            resultBlocksContainer.appendChild(item);
            totalCount++;
        });
    });

    // 更新统计
    if (resultBlockCountSpan) {
        resultBlockCountSpan.textContent = totalCount;
    }

    console.log(`✅ 已显示${totalCount}条纯文本智能标注`);
}

// 显示空标注状态的函数
function showEmptyAnnotationState() {
    const resultBlocksContainer = document.getElementById('resultBlocksContainer');
    const resultBlockCountSpan = document.getElementById('resultBlockCount');

    if (resultBlockCountSpan) {
        resultBlockCountSpan.textContent = '0';
    }

    if (resultBlocksContainer) {
        resultBlocksContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-images" style="font-size: 3em; opacity: 0.3; margin-bottom: 15px;"></i>
                <h3>暂无智能标注</h3>
                <p>上传作文图片并完成OCR识别后，将显示智能标注结果</p>
            </div>
        `;
    }

    console.log('✅ 已显示智能标注占位状态');
}

// 创建批改结果页面的智能标注列表项
function createResultAnnotationListItem(sentence, config, type, ocrIndex) {
    const item = document.createElement('div');
    item.className = 'annotation-item';
    item.dataset.index = ocrIndex;  // 统一使用data-index属性
    item.dataset.type = type;

    // 如果是多块匹配，添加额外信息
    const isMultiBlock = sentence.isMultiBlock || (sentence.ocrIndexes && sentence.ocrIndexes.length > 1);
    const multiBlockInfo = isMultiBlock && sentence.ocrIndexes
        ? `<span class="multi-block-badge" title="此标注跨越 ${sentence.ocrIndexes.length} 个文本块">[${sentence.ocrIndexes.length}块]</span>`
        : '';

    const similarityPercent = (sentence.similarity * 100).toFixed(1);

    item.innerHTML = `
        <div class="annotation-header">
            <span class="annotation-icon">${config.icon}</span>
            <span class="annotation-label">${config.label}</span>
            ${multiBlockInfo}
            <span class="annotation-similarity">匹配度: ${similarityPercent}%</span>
        </div>
        <div class="annotation-text">${escapeHtml(sentence.text)}</div>
        ${sentence.nice_reason || sentence.good_reason || sentence.improve_reason
            ? `<div class="annotation-reason">${escapeHtml(sentence.nice_reason || sentence.good_reason || sentence.improve_reason)}</div>`
            : ''}
        <div class="annotation-match">匹配文本: ${escapeHtml(sentence.matchedText || '')}</div>
        ${isMultiBlock && sentence.ocrIndexes
            ? `<div class="annotation-blocks">涉及块: ${sentence.ocrIndexes.map(i => `#${i + 1}`).join(', ')}</div>`
            : ''}
    `;

    // 点击高亮对应的图片区域（支持多块）
    item.addEventListener('click', () => {
        if (sentence.ocrIndexes && sentence.ocrIndexes.length > 0) {
            // 多块情况：高亮所有相关块
            sentence.ocrIndexes.forEach(index => {
                highlightResultTextBox(index);
                highlightResultBlockItem(index);
            });
        } else {
            // 单块情况
            highlightResultTextBox(ocrIndex);
            highlightResultBlockItem(ocrIndex);
        }
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    return item;
}

// 在批改结果页面的图片上添加智能标注框
function addResultAnnotationBox(sentence, config, ocrIndex) {
    const resultImageWithBoxes = document.getElementById('resultImageWithBoxes');

    if (!resultImageWithBoxes || ocrIndex < 0) return;

    // 找到对应的OCR文本框
    const originalBox = resultImageWithBoxes.querySelector(`.ocr-text-box[data-index="${ocrIndex}"]`);
    if (!originalBox) return;

    // 复制样式并添加智能标注样式
    const annotationBox = originalBox.cloneNode(true);
    annotationBox.className = `ocr-text-box annotation-box ${sentence.type || ''}`;
    annotationBox.dataset.index = ocrIndex;
    annotationBox.dataset.annotationType = sentence.type || '';

    // 应用智能标注样式
    annotationBox.style.border = `3px solid ${config.color}`;
    annotationBox.style.backgroundColor = `${config.color}20`;
    annotationBox.style.boxShadow = `0 0 10px ${config.color}40`;

    // 添加悬浮提示
    annotationBox.title = `${config.label}: ${sentence.text}`;

    // 更新标签
    const label = annotationBox.querySelector('.box-label');
    if (label) {
        label.textContent = config.icon;
        label.style.backgroundColor = config.color;
    }

    // 更新文本
    const boxText = annotationBox.querySelector('.box-text');
    if (boxText) {
        boxText.textContent = (sentence.text || '').substring(0, 15);
    }

    // 移除原来的文本框，避免重复
    originalBox.remove();

    // 添加到图片容器
    resultImageWithBoxes.appendChild(annotationBox);
}

// 高亮批改结果页面的文本框
function highlightResultTextBox(index) {
    const resultImageWithBoxes = document.getElementById('resultImageWithBoxes');
    if (!resultImageWithBoxes) return;

    const textBoxes = resultImageWithBoxes.querySelectorAll('.ocr-text-box');
    textBoxes.forEach(box => {
        box.style.borderWidth = '2px';
        box.style.borderColor = 'var(--primary)';
        box.style.transform = 'scale(1)';
    });

    const targetBox = resultImageWithBoxes.querySelector(`.ocr-text-box[data-index="${index}"]`);
    if (targetBox) {
        targetBox.style.borderWidth = '3px';
        targetBox.style.borderColor = '#ff6b6b';
        targetBox.style.transform = 'scale(1.05)';
        targetBox.style.zIndex = '1000';
    }
}

// 高亮批改结果页面的列表项
function highlightResultBlockItem(index) {
    const resultBlocksContainer = document.getElementById('resultBlocksContainer');
    if (!resultBlocksContainer) return;

    const blockItems = resultBlocksContainer.querySelectorAll('.annotation-item');
    blockItems.forEach(item => {
        item.classList.remove('highlighted');
    });

    // 统一使用data-index属性选择器
    const targetItem = resultBlocksContainer.querySelector(`.annotation-item[data-index="${index}"]`);
    if (targetItem) {
        targetItem.classList.add('highlighted');
        targetItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}
