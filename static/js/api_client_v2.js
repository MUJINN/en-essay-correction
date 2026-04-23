/**
 * 重构后的前端API客户端（方案1：后端主导架构）
 *
 * 简化后的前端逻辑，只负责展示，不处理业务逻辑
 */

class APIClientV2 {
    constructor(baseURL = '') {
        this.baseURL = baseURL;
    }

    /**
     * OCR识别
     * @param {File} imageFile - 图片文件
     * @returns {Promise<Object>} OCR结果
     */
    async performOCR(imageFile) {
        console.log('🔍 开始OCR识别...');

        const formData = new FormData();
        formData.append('image', imageFile);

        const response = await fetch('/api/v2/ocr', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'OCR识别失败');
        }

        console.log('✅ OCR识别成功:', result);
        return result;
    }

    /**
     * 提交批改请求（简化版）
     * @param {Object} formData - 表单数据
     * @param {Object} ocrData - OCR数据（可选）
     * @returns {Promise<Object>} 批改结果
     */
    async submitCorrection(formData, ocrData = null) {
        console.log('📝 开始提交批改请求...');

        // 构建请求数据
        const requestData = {
            task_key: formData.task_key || 'web-demo-task',
            grade: formData.grade || '',
            subject_chs: formData.subject_chs || '英语',
            question_content: formData.question_content || '',
            total_score: formData.total_score || '15',
            student_answer: formData.student_answer || '',
            breakdown_type: formData.breakdown_type || '',
            // ✅ 新增：OCR数据（后端需要的字段）
            ocr_data: ocrData,
            image_data: window.currentOCRImageData || null,  // 图片Base64数据
            image_id: ocrData?.image_id || null
        };

        console.log('📤 发送批改请求:', requestData);

        const response = await fetch('/api/v2/correct', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || '批改失败');
        }

        console.log('✅ 批改成功:', result.data);
        return result.data;
    }

    /**
     * 获取历史记录列表
     * @param {Object} params - 查询参数
     * @returns {Promise<Object>} 历史记录列表
     */
    async getHistoryList(params = {}) {
        console.log('📜 获取历史记录列表...');

        const queryParams = new URLSearchParams({
            page: params.page || 1,
            size: params.size || 20
        });

        if (params.grade) {
            queryParams.append('grade', params.grade);
        }

        if (params.search) {
            queryParams.append('search', params.search);
        }

        const response = await fetch(`/api/v2/history/list?${queryParams}`);

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || '获取历史记录失败');
        }

        console.log('✅ 历史记录获取成功:', result.data);
        return result.data;
    }

    /**
     * 获取历史记录详情
     * @param {string} recordId - 记录ID
     * @returns {Promise<Object>} 历史记录详情
     */
    async getHistoryDetail(recordId) {
        console.log('🔍 获取历史记录详情:', recordId);

        const response = await fetch(`/api/v2/history/${recordId}`);

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || '获取历史记录详情失败');
        }

        console.log('✅ 历史记录详情获取成功:', result.data);
        return result.data;
    }

    /**
     * 加载示例数据
     * @returns {Promise<Object>} 示例数据
     */
    async loadExample() {
        console.log('📋 加载示例数据...');

        const response = await fetch('/api/load-example');
        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || '加载示例失败');
        }

        console.log('✅ 示例数据加载成功:', result.data);
        return result.data;
    }
}

/**
 * 简化的前端业务流程
 */
class FrontendServiceV2 {
    constructor() {
        this.apiClient = new APIClientV2();
        this.currentOCRData = null;  // 当前OCR数据
    }

    /**
     * 完整的OCR+批改流程
     * @param {Object} formData - 表单数据
     * @param {File} imageFile - 图片文件
     * @returns {Promise<Object>} 批改结果
     */
    async processImageWithCorrection(formData, imageFile) {
        try {
            // 1. 执行OCR识别
            console.log('🖼️ 第1步：执行OCR识别');
            const ocrResult = await this.apiClient.performOCR(imageFile);
            this.currentOCRData = ocrResult;

            // 2. 提交批改请求（包含OCR数据）
            console.log('📝 第2步：提交批改请求');
            const correctionResult = await this.apiClient.submitCorrection(formData, ocrResult);

            // 3. 返回完整结果
            return {
                ocrData: ocrResult,
                correctionData: correctionResult,
                success: true
            };

        } catch (error) {
            console.error('❌ 处理失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 仅文本批改（无OCR）
     * @param {Object} formData - 表单数据
     * @returns {Promise<Object>} 批改结果
     */
    async processTextOnly(formData) {
        try {
            console.log('📝 提交文本批改请求');
            const correctionResult = await this.apiClient.submitCorrection(formData, null);

            return {
                correctionData: correctionResult,
                success: true
            };

        } catch (error) {
            console.error('❌ 文本批改失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 显示批改结果（简化版）
     * @param {Object} data - 批改结果数据
     * @param {Object} ocrData - OCR数据（可选）
     */
    displayResult(data, ocrData = null) {
        console.log('📊 显示批改结果:', data);

        // ✅ 直接使用后端返回的数据，无需复杂处理
        const outputs = data.outputs;
        const boxesData = data.boxes_data || [];  // OCR坐标数据
        const annotationData = outputs.intelligent_annotation;

        // 1. 显示批改结果
        this._displayCorrectionOutputs(outputs);

        // 2. 显示智能标注（如果存在）
        if (boxesData.length > 0 && annotationData) {
            console.log('✅ 显示智能标注可视化');
            // 无需复杂的匹配逻辑，直接使用后端匹配结果
            this._displayIntelligentAnnotation(boxesData, annotationData, data.ocr_annotation_match);
        }
    }

    /**
     * 显示批改结果（内部方法）
     * @param {Object} outputs - 批改输出数据
     */
    _displayCorrectionOutputs(outputs) {
        // 这里调用原有的显示逻辑，但简化数据处理
        if (typeof window.displayResult === 'function') {
            window.displayResult(outputs);
        }
    }

    /**
     * 显示智能标注（内部方法）
     * @param {Array} boxesData - OCR坐标数据
     * @param {Object} annotationData - 智能标注数据
     * @param {Array} matchData - 匹配关系数据（后端返回）
     */
    _displayIntelligentAnnotation(boxesData, annotationData, matchData) {
        // 使用原有的显示逻辑，但简化匹配过程
        if (typeof window.showResultAnnotation === 'function') {
            // 直接传递后端匹配好的数据，无需前端再次匹配
            window.showResultAnnotation(boxesData, annotationData, matchData);
        }
    }

    /**
     * 加载历史记录
     * @param {Object} params - 查询参数
     * @returns {Promise<Object>} 历史记录列表
     */
    async loadHistory(params = {}) {
        try {
            return await this.apiClient.getHistoryList(params);
        } catch (error) {
            console.error('❌ 加载历史记录失败:', error);
            throw error;
        }
    }

    /**
     * 加载历史记录详情
     * @param {string} recordId - 记录ID
     * @returns {Promise<Object>} 历史记录详情
     */
    async loadHistoryDetail(recordId) {
        try {
            return await this.apiClient.getHistoryDetail(recordId);
        } catch (error) {
            console.error('❌ 加载历史记录详情失败:', error);
            throw error;
        }
    }
}

// 导出供前端使用
window.APIClientV2 = APIClientV2;
window.FrontendServiceV2 = FrontendServiceV2;

// 创建全局实例
window.apiServiceV2 = new FrontendServiceV2();

console.log('✅ API客户端 v2.0 已加载');
