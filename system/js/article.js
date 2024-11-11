class ArticleManager {
    static articles = [];
    static filters = {
        category: '',
        status: ''
    };
    static searchKeyword = '';
    static pageConfig = {
        pageSize: 10,
        currentPage: 1,
        total: 0,
        pages: 0
    };

    // 获取文章列表
    static async fetchArticles() {
        try {
            const response = await fetch(`/api/articles?page=${this.pageConfig.currentPage}&type=0`);
            if (!response.ok) {
                throw new Error('获取文章列表失败');
            }

            const result = await response.json();
            if (result.success) {
                this.articles = result.data;
                this.pageConfig.total = result.total;
                this.pageConfig.pages = result.pages;
                this.renderArticleList();
            } else {
                throw new Error(result.message || '获取文章列表失败');
            }
        } catch (error) {
            console.error('获取文章列表错误:', error);
            // 可以添加错误提示
            MessageBox.error(error.message);
        }
    }

    // 渲染文章列表
    static renderArticleList() {
        const tbody = document.getElementById('articleList');
        if (!tbody) return;

        tbody.innerHTML = this.articles.length ? this.articles.map(article => `
            <tr>
                <td><input type="checkbox" value="${article.id}"></td>
                <td>${article.article_id || '-'}</td>
                <td class="article-title">${article.title}</td>
                <td>${article.content}</td>
                <td>${this.getTagName(article.tag)}</td>
                <td>
                    <button class="status-btn ${article.status === 1 ? 'published' : 'draft'}"
                            onclick="ArticleManager.toggleStatus(${article.id}, ${article.status})">
                        ${article.status === 1 ? '已发布' : '待发布'}
                    </button>
                </td>
                <td>${article.created_at || '-'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon" onclick="ArticleManager.editArticle(${article.article_id})" title="编辑基本信息">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon" onclick="ArticleManager.editContent(${article.article_id})" title="编辑文章内容">
                            <i class="fas fa-file-alt"></i>
                        </button>
                        <button class="btn-icon delete" onclick="ArticleManager.deleteArticle(${article.id})" title="删除">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('') : '<tr><td colspan="8" class="empty-message">暂无文章数据</td></tr>';

        // 更新分页信息
        this.updatePagination();
    }

    // 获取标签名称
    static getTagName(tag) {
        const tagMap = {
            0: '软件',
            1: '游戏',
            2: '小说'
        };
        return tagMap[tag] || '未知';
    }

    // 更新分页信息
    static updatePagination() {
        const pagination = document.getElementById('pagination');
        if (!pagination) return;
        
        let paginationHTML = `
            <div class="pagination-info">共 ${this.pageConfig.total} 条记录，每页 ${this.pageConfig.pageSize} 条</div>
            <div class="pagination-buttons">
                <button class="btn-page" 
                        onclick="ArticleManager.changePage(${this.pageConfig.currentPage - 1})"
                        ${this.pageConfig.currentPage === 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i>
                </button>
                <span class="current-page">第 ${this.pageConfig.currentPage} 页</span>
                <button class="btn-page" 
                        onclick="ArticleManager.changePage(${this.pageConfig.currentPage + 1})"
                        ${this.pageConfig.currentPage === this.pageConfig.pages ? 'disabled' : ''}>
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>`;
        
        pagination.innerHTML = paginationHTML;
    }

    // 切换页面
    static async changePage(page) {
        if (page < 1 || page > this.pageConfig.pages) return;
        this.pageConfig.currentPage = page;
        await this.fetchArticles();
    }

    // 删除文章
    static async deleteArticle(id) {
        if (confirm('确定要删除这篇文章吗？')) {
            try {
                const response = await fetch(`/articles/${id}`, {
                    method: 'DELETE'
                });

                if (response.ok) {
                    MessageBox.success('删除成功');
                    await this.fetchArticles(); // 重新获取列表
                } else {
                    throw new Error('删除文章失败');
                }
            } catch (error) {
                console.error('删除文章错误:', error);
                MessageBox.error(error.message);
            }
        }
    }

    // 切换文章状态
    static async toggleStatus(id, currentStatus) {
        try {
            const newStatus = currentStatus === 1 ? 0 : 1;
            const response = await fetch(`/articles/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    status: newStatus
                })
            });

            if (!response.ok) {
                throw new Error('更新状态失败');
            }

            MessageBox.success(newStatus === 1 ? '文章已发布' : '文章已转为草稿');
            await this.fetchArticles(); // 重新获取列表

        } catch (error) {
            console.error('更新状态错误:', error);
            MessageBox.error(error.message);
        }
    }

    // 显示模态框
    static showModal(title = '添加文章') {
        const modal = document.querySelector('.modal');
        const modalTitle = document.querySelector('.modal-header h3');
        
        if (modal && modalTitle) {
            modalTitle.textContent = title;
            modal.classList.add('show');
            
            // 重置表单
            const form = document.getElementById('articleForm');
            if (form) {
                form.reset();
                form.dataset.articleId = ''; // 清除之前的文章ID
            }
        }
    }

    // 关闭模态框
    static hideModal() {
        const modal = document.querySelector('.modal');
        if (modal) {
            modal.classList.add('closing');
            // 等待动画完成后再隐藏
            setTimeout(() => {
                modal.classList.remove('show', 'closing');
            }, 300); // 与 CSS 动画时长匹配
        }
    }

     // 处理表单提交
     static async handleSubmit(event) {
        event.preventDefault();
        const form = event.target;
        
        try {
            // 获取表单数据
            const formData = {
                title: form.title.value,
                description: form.description.value || '',
                tag: parseInt(form.tags.value)
            };

            const article_id = form.dataset.articleId;
            let url = '/api/articles';
            let method = 'POST';

            // 如果有文章ID，则为编辑模式
            if (article_id) {
                url = `/api/articles/${article_id}`;
                method = 'PUT';
            }

            // 发送请求
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (response.ok) {
                MessageBox.success(result.message || (article_id ? '文章更新成功' : '文章创建成功'));
                await this.fetchArticles(); // 刷新文章列表
                this.hideModal(); // 关闭模态框
            } else {
                throw new Error(result.message || '操作失败');
            }
        } catch (error) {
            console.error('提交文章错误:', error);
            MessageBox.error(error.message);
        }
    }

    // 编辑文章
    static async editArticle(article_id) {
        try {
            // 获取文章详情
            const response = await fetch(`/api/articles/${article_id}`);
            if (!response.ok) {
                throw new Error('获取文章详情失败');
            }

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || '获取文章详情失败');
            }

            const article = result.data;
            
            // 显示模态框
            this.showModal('编辑文章');
            
            // 填充表单数据
            const form = document.getElementById('articleForm');
            if (form) {
                form.title.value = article.title || '';
                form.description.value = article.content || '';
                form.tags.value = article.tag || 0;
                form.dataset.articleId = article_id; // 保存文章ID用于提交时识别
            }
        } catch (error) {
            console.error('编辑文章错误:', error);
            MessageBox.error(error.message);
        }
    }

    // 添加编辑文章内容的方法
    static editContent(article_id) {
        // 构建 URL 参数
        const params = new URLSearchParams({
            article_id,
            type: 'content'  // 添加类型参数，表示编辑内容
        });
        
        // 在新标签页打开编辑页面
        window.open(`/system/views/article/edit.html?${params.toString()}`, '_blank');
    }

    // 添加静态初始化方法
    static init() {
        this.fetchArticles();
        
        // 绑定表单提交事件
        const form = document.getElementById('articleForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleSubmit.call(this, e));
        }
    }
}

// 修改初始化函数
async function initPage() {
    try {
        await ArticleManager.init();
    } catch (error) {
        console.error('初始化页面失败:', error);
        MessageBox.error('页面初始化失败');
    }
}

// 导出初始化函数和类
window.initPage = initPage;
window.ArticleManager = ArticleManager;