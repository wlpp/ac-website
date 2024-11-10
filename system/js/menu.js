console.log('menu.js loaded');

class MenuManager {
    static menus = [];
    static currentEditId = null;

    // 获取菜单列表
    static async fetchMenus() {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('未找到登录凭证');
            }

            // 这里应该是从后端获取数据，暂时用模拟数据
            this.menus = [
                {
                    id: 1,
                    name: '首页',
                    url: '/dashboard',
                    icon: 'fas fa-home',
                    parentId: 0,
                    sort: 0,
                    status: 1
                },
                {
                    id: 2,
                    name: '用户管理',
                    url: '/user',
                    icon: 'fas fa-users',
                    parentId: 0,
                    sort: 1,
                    status: 1
                }
            ];
            return this.menus;
        } catch (error) {
            console.error('获取菜单列表错误:', error);
            throw error;
        }
    }

    // 渲染菜单列表
    static renderMenuList() {
        const tbody = document.getElementById('menuList');
        if (!tbody) return;

        tbody.innerHTML = this.menus.map(menu => `
            <tr>
                <td>${menu.id}</td>
                <td>
                    <i class="${menu.icon}"></i>
                    ${menu.name}
                </td>
                <td>${menu.url}</td>
                <td><i class="${menu.icon}"></i></td>
                <td>${menu.sort}</td>
                <td>
                    <span class="status-badge ${menu.status ? 'active' : 'inactive'}">
                        ${menu.status ? '启用' : '禁用'}
                    </span>
                </td>
                <td>
                    <button class="btn-icon" onclick="MenuManager.editMenu(${menu.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon delete" onclick="MenuManager.deleteMenu(${menu.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // 显示模态框
    static showModal(title = '添加菜单') {
        const modal = document.querySelector('.modal');
        const modalTitle = modal.querySelector('.modal-header h3');
        
        if (modal && modalTitle) {
            modal.classList.add('show');
            // 重置表单
            const form = document.querySelector('#menuForm');
            if (form) {
                form.reset();
                this.updateParentMenuOptions();
            }
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

    // 编辑菜单
    static editMenu(id) {
        this.currentEditId = id;
        const menu = this.menus.find(m => m.id === id);
        if (!menu) return;

        this.showModal('编辑菜单');
        const form = document.getElementById('menuForm');
        form.name.value = menu.name;
        form.url.value = menu.url;
        form.icon.value = menu.icon;
        form.parentId.value = menu.parentId;
        form.sort.value = menu.sort;
        form.status.value = menu.status;

        this.updateParentMenuOptions(id);
    }

    // 更新父级菜单选项
    static updateParentMenuOptions(excludeId = null) {
        const select = document.querySelector('select[name="parentId"]');
        if (!select) return;
        
        select.innerHTML = '<option value="0">无</option>';
        const topMenus = this.menus.filter(m => m.parentId === 0 && m.id !== excludeId);
        topMenus.forEach(menu => {
            select.innerHTML += `<option value="${menu.id}">${menu.name}</option>`;
        });
    }

    // 保存菜单
    static async handleSubmit(e) {
        e.preventDefault();
        try {
            const form = e.target;
            const menuData = {
                name: form.name.value,
                url: form.url.value,
                icon: form.icon.value,
                parentId: parseInt(form.parentId.value),
                sort: parseInt(form.sort.value),
                status: parseInt(form.status.value)
            };

            if (this.currentEditId) {
                // 编辑现有菜单
                await this.updateMenu(this.currentEditId, menuData);
            } else {
                // 添加新菜单
                await this.addMenu(menuData);
            }

            this.hideModal();
            this.renderMenuList();
            MessageBox.success(this.currentEditId ? '更新成功' : '添加成功');
        } catch (error) {
            MessageBox.error(error.message);
        }
    }

    // 删除菜单
    static async deleteMenu(id) {
        if (!confirm('确定要删除这个菜单吗？')) return;

        try {
            // 检查是否有子菜单
            const hasChildren = this.menus.some(m => m.parentId === id);
            if (hasChildren) {
                throw new Error('请先删除该菜单的子菜单');
            }

            // 这里应该调用后端 API
            this.menus = this.menus.filter(m => m.id !== id);
            this.renderMenuList();
            MessageBox.success('删除成功');
        } catch (error) {
            MessageBox.error(error.message);
        }
    }
}

// 页面初始化函数
async function initPage() {
    try {
        await MenuManager.fetchMenus();
        MenuManager.renderMenuList();
        
        // 绑定添加菜单按钮
        const addMenuBtn = document.querySelector('.btn-primary');
        if (addMenuBtn) {
            addMenuBtn.addEventListener('click', () => MenuManager.showModal());
        }

        // 绑定表单提交
        const menuForm = document.querySelector('#menuForm');
        if (menuForm) {
            menuForm.addEventListener('submit', (e) => MenuManager.handleSubmit.call(MenuManager, e));
        }

        // 绑定关闭按钮
        document.querySelectorAll('.close-btn').forEach(btn => {
            btn.addEventListener('click', () => MenuManager.hideModal());
        });

        // 绑定模态框外部点击关闭
        const modal = document.querySelector('.modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) MenuManager.hideModal();
            });
        }
    } catch (error) {
        console.error('初始化页面失败:', error);
    }
}

// 导出初始化函数
window.initPage = initPage; 