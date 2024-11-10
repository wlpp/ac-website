// 文章列表数据
let articles = [];
let currentPage = 1;
const pageSize = 10;

// 初始化文章列表
function initArticleList() {
    // 模拟数据，实际项目中应该从后端获取
    articles = [
        {
            id: 1,
            title: '示例文章1',
            category: '技术',
            author: '管理员',
            status: 'published',
            publishTime: '2024-01-01 12:00:00'
        },
        {
            id: 2,
            title: '示例文章2',
            category: '新闻',
            author: '管理员',
            status: 'draft',
            publishTime: '-'
        }
    ];
    renderArticleList();
    renderPagination();
}

// 渲染文章列表
function renderArticleList() {
    const tbody = document.getElementById('articleList');
    if (!tbody) return;

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageData = articles.slice(startIndex, endIndex);

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
                <button class="btn-icon" onclick="editArticle(${article.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon delete" onclick="deleteArticle(${article.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('') : '<tr><td colspan="8" class="empty-message">暂无文章数据</td></tr>';
}

// 渲染分页
function renderPagination() {
    const totalPages = Math.ceil(articles.length / pageSize);
    const pagination = document.getElementById('pagination');
    if (!pagination) return;

    let html = '';
    if (currentPage > 1) {
        html += `<button onclick="changePage(${currentPage - 1})">上一页</button>`;
    }
    
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="${i === currentPage ? 'active' : ''}" 
                         onclick="changePage(${i})">${i}</button>`;
    }
    
    if (currentPage < totalPages) {
        html += `<button onclick="changePage(${currentPage + 1})">下一页</button>`;
    }
    
    pagination.innerHTML = html;
}

// 切换页码
function changePage(page) {
    currentPage = page;
    renderArticleList();
    renderPagination();
}

// 编辑文章
function editArticle(id) {
    loadPage('article/edit');
    // TODO: 加载文章数据
}

// 删除文章
function deleteArticle(id) {
    if (confirm('确定要删除这篇文章吗？')) {
        articles = articles.filter(a => a.id !== id);
        renderArticleList();
        renderPagination();
    }
}

// 搜索文章
function searchArticles(keyword) {
    if (!keyword.trim()) {
        renderArticleList();
        return;
    }
    
    const filtered = articles.filter(article => 
        article.title.toLowerCase().includes(keyword.toLowerCase())
    );
    
    const tbody = document.getElementById('articleList');
    if (!tbody) return;

    tbody.innerHTML = filtered.length ? filtered.map(article => `
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
                <button class="btn-icon" onclick="editArticle(${article.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon delete" onclick="deleteArticle(${article.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('') : '<tr><td colspan="8" class="empty-message">暂无文章数据</td></tr>';
} 