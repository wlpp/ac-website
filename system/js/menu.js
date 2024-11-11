console.log('menu.js loaded');

class MenuManager {
    static menus = [];
    static pageConfig = {
        pageSize: 10,
        currentPage: 1,
        total: 0,
        pages: 0
    };

    // 获取菜单列表
    static async fetchMenus() {
        try {
            const response = await fetch(`/api/menus?page=${this.pageConfig.currentPage}`);
            if (!response.ok) {
                throw new Error('获取菜单列表失败');
            }

            const result = await response.json();
            if (result.success) {
                this.menus = result.data;
                this.pageConfig.total = result.total;
                this.pageConfig.pages = result.pages;
                this.renderMenuList();
            } else {
                throw new Error(result.message || '获取菜单列表失败');
            }
        } catch (error) {
            console.error('获取菜单列表错误:', error);
            MessageBox.error(error.message);
        }
    }

    // 渲染菜单列表
    static renderMenuList() {
        const tbody = document.getElementById('menuList');
        if (!tbody) return;

        tbody.innerHTML = this.menus.length ? this.menus.map(menu => `
            <tr>
                <td><input type="checkbox" value="${menu.id}"></td>
                <td>${menu.id}</td>
                <td>${menu.name}</td>
                <td>${menu.path}</td>
                <td>${menu.parent_id || '-'}</td>
                <td>${menu.sort_order}</td>
                <td>
                    <span class="status-badge ${menu.status ? 'active' : 'inactive'}">
                        ${menu.status ? '启用' : '禁用'}
                    </span>
                </td>
                <td>${menu.created_at}</td>
                <td>
                    <button class="btn-icon" onclick="MenuManager.editMenu(${menu.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon delete" onclick="MenuManager.deleteMenu(${menu.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('') : '<tr><td colspan="9" class="empty-message">暂无菜单数据</td></tr>';

        // 更新分页信息
        this.updatePagination();
    }

    // 更新分页信息
    static updatePagination() {
        const pagination = document.querySelector('.pagination');
        if (!pagination) return;

        let paginationHtml = `
            <button onclick="MenuManager.changePage(${this.pageConfig.currentPage - 1})" 
                    ${this.pageConfig.currentPage <= 1 ? 'disabled' : ''}>
                上一页
            </button>
            <span>第 ${this.pageConfig.currentPage} 页 / 共 ${this.pageConfig.pages} 页</span>
            <button onclick="MenuManager.changePage(${this.pageConfig.currentPage + 1})"
                    ${this.pageConfig.currentPage >= this.pageConfig.pages ? 'disabled' : ''}>
                下一页
            </button>
        `;

        pagination.innerHTML = paginationHtml;
    }

    // 切换页码
    static async changePage(page) {
        if (page < 1 || page > this.pageConfig.pages) return;
        this.pageConfig.currentPage = page;
        await this.fetchMenus();
    }

    // 显示模态框
    static showModal(title = '添加菜单') {
        const modal = document.querySelector('.modal');
        const modalTitle = modal?.querySelector('.modal-header h3');
        if (modal && modalTitle) {
            modalTitle.textContent = title;
            modal.classList.add('show');
            // 重置表单
            const form = document.getElementById('menuForm');
            if (form) form.reset();
        }
    }

    // 隐藏模态框
    static hideModal() {
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
        const form = event.target;
        
        try {
            const formData = {
                name: form.name.value,
                path: form.path.value,
                parent_id: form.parent_id.value || null,
                sort_order: parseInt(form.sort_order.value) || 0,
                status: parseInt(form.status.value)
            };

            const response = await fetch('/api/menus', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (response.ok) {
                MessageBox.success(result.message || '菜单创建成功');
                await this.fetchMenus();
                this.hideModal();
            } else {
                throw new Error(result.message || '创建菜单失败');
            }
        } catch (error) {
            console.error('创建菜单错误:', error);
            MessageBox.error(error.message);
        }
    }

    // 初始化方法
    static async init() {
        try {
            await this.fetchMenus();
            
            // 绑定事件
            const addBtn = document.querySelector('.btn-primary');
            if (addBtn) {
                addBtn.addEventListener('click', () => this.showModal());
            }

            const closeBtn = document.querySelector('.close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.hideModal());
            }

            const form = document.getElementById('menuForm');
            if (form) {
                form.addEventListener('submit', (e) => this.handleSubmit(e));
            }
        } catch (error) {
            console.error('初始化菜单管理页面失败:', error);
            MessageBox.error('初始化页面失败');
        }
    }
}

// 初始化函数
async function initPage() {
    try {
        await MenuManager.init();
    } catch (error) {
        console.error('初始化页面失败:', error);
        MessageBox.error('页面初始化失败');
    }
}

// 导出初始化函数和类
window.initPage = initPage;
window.MenuManager = MenuManager; 