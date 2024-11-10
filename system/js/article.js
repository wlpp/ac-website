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
        total: 0
    };

    // 显示模态框
    static showModal() {
        const modal = document.querySelector('.modal');
        const modalTitle = document.querySelector('.modal-header h3');
        
        if (modal && modalTitle) {
            modal.classList.add('show');
            modalTitle.textContent = '创建文章';
            
            // 重置表单
            const form = document.querySelector('#articleForm');
            if (form) {
                form.reset();
            }
        }
    }

    // 关闭模态框
    static closeModal() {
        const modal = document.querySelector('.modal');
        if (modal) {
            modal.classList.add('closing');
            setTimeout(() => {
                modal.classList.remove('show', 'closing');
            }, 300);
        }
    }

    // 处理表单提交
    static async handleSubmit(event) {
        event.preventDefault();
        try {
            const form = event.target;
            const articleData = {
                title: form.title.value,
                tags: form.tags.value
            };

            console.log('提交的文章数据:', articleData);
            // TODO: 发送到后端API
            
            // 关闭模态框
            this.closeModal();
            
            // 跳转到编辑页面
            window.location.href = `/system/views/article/edit.html?title=${encodeURIComponent(articleData.title)}`;
            
        } catch (error) {
            console.error('提交文章失败:', error);
            // TODO: 显示错误消息
        }
    }

    // 渲染文章列表
    static renderArticleList() {
        const tbody = document.getElementById('articleList');
        if (!tbody) return;

        const startIndex = (this.pageConfig.currentPage - 1) * this.pageConfig.pageSize;
        const endIndex = startIndex + this.pageConfig.pageSize;
        const pageData = this.articles.slice(startIndex, endIndex);

        tbody.innerHTML = pageData.length ? pageData.map(article => `
            <tr>
                <td><input type="checkbox" value="${article.id}"></td>
                <td>${article.id}</td>
                <td class="article-title">${article.title}</td>
                <td>${article.category}</td>
                <td>${article.author}</td>
                <td>
                    <span class="status-badge ${article.status === 'published' ? 'active' : 'inactive'}">
                        ${article.status === 'published' ? '已发布' : '草稿'}
                    </span>
                </td>
                <td>${article.publishTime}</td>
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
    }

    // 筛选文章
    static filterArticles(type, value) {
        this.filters[type] = value;
        this.pageConfig.currentPage = 1;
        this.renderArticleList();
    }

    // 搜索文章
    static searchArticles(keyword) {
        this.searchKeyword = keyword;
        this.pageConfig.currentPage = 1;
        this.renderArticleList();
    }

    // 编辑文章
    static editArticle(id) {
        window.location.href = `/system/views/article/edit.html?id=${id}`;
    }

    // 删除文章
    static deleteArticle(id) {
        if (confirm('确定要删除这篇文章吗？')) {
            this.articles = this.articles.filter(a => a.id !== id);
            this.renderArticleList();
        }
    }
}

// 页面初始化
async function initPage() {
    try {
        // 绑定模态框相关事件
        const modal = document.querySelector('.modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) ArticleManager.closeModal();
            });
        }

        // 绑定表单提交事件
        const articleForm = document.querySelector('#articleForm');
        if (articleForm) {
            articleForm.addEventListener('submit', (e) => ArticleManager.handleSubmit(e));
        }

        // TODO: 加载文章列表数据
        ArticleManager.renderArticleList();
    } catch (error) {
        console.error('初始化页面失败:', error);
    }
}

// 导出初始化函数
window.initPage = initPage;