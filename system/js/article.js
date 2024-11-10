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
            const response = await fetch(`/api/articles?page=${this.pageConfig.currentPage}`);
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
                <td>${this.getTagName(article.tag)}</td>
                <td>${article.created_at}</td>
                <td>
                    <button class="status-btn ${article.status === 1 ? 'published' : 'draft'}"
                            onclick="ArticleManager.toggleStatus(${article.id}, ${article.status})">
                        ${article.status === 1 ? '已发布' : '待发布'}
                    </button>
                </td>
                <td>${article.n_date || '-'}</td>
                <td>
                    <button class="btn-icon" onclick="ArticleManager.editArticle(${article.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon delete" onclick="ArticleManager.deleteArticle(${article.id})">
                        <i class="fas fa-trash"></i>
                    </button>
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
        const pagination = document.querySelector('.pagination');
        if (!pagination) return;

        // 生成分页按钮
        let paginationHtml = `
            <button onclick="ArticleManager.changePage(${this.pageConfig.currentPage - 1})" 
                    ${this.pageConfig.currentPage <= 1 ? 'disabled' : ''}>
                上一页
            </button>
            <span>第 ${this.pageConfig.currentPage} 页 / 共 ${this.pageConfig.pages} 页</span>
            <button onclick="ArticleManager.changePage(${this.pageConfig.currentPage + 1})"
                    ${this.pageConfig.currentPage >= this.pageConfig.pages ? 'disabled' : ''}>
                下一页
            </button>
        `;
        
        pagination.innerHTML = paginationHtml;
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
}

// 页面初始化
async function initPage() {
    try {
        // 获取并渲染文章列表
        await ArticleManager.fetchArticles();
        
        // 绑定模态框事件
        const modal = document.querySelector('.modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    ArticleManager.closeModal();
                }
            });
        }

        // 绑定表单提交事件
        const form = document.getElementById('articleForm');
        if (form) {
            form.addEventListener('submit', (e) => ArticleManager.handleSubmit.call(ArticleManager, e));
        }
    } catch (error) {
        console.error('初始化页面失败:', error);
        MessageBox.error('页面初始化失败');
    }
}

// 导出初始化函数
window.initPage = initPage;
window.ArticleManager = ArticleManager;