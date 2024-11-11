console.log('user.js loaded');
// 删除 mockUsers 数组，添加 UserManager 类来管理用户数据和操作
class UserManager {
    static users = [];
    static filters = {
        role: '',
        status: ''
    };
    static searchKeyword = '';
    static pageConfig = {
        pageSize: 10,
        currentPage: 1,
        total: 0
    };

    // 获取用户列表
    static async fetchUsers() {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('未找到登录凭证');
            }

            const params = new URLSearchParams({
                page: this.pageConfig.currentPage,
                per_page: this.pageConfig.pageSize,
                role: this.filters.role,
                status: this.filters.status,
                username: this.searchKeyword
            });

            const url = `${window.baseURL}/api/users?${params}`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '/login';
                    return;
                }
                throw new Error('获取用户列表失败');
            }

            const data = await response.json();
            this.users = data.users;
            this.pageConfig.total = data.total;
            this.renderUserList();
            return data;
        } catch (error) {
            console.error('获取用户列表错误:', error);
            throw error;
        }
    }

    // 渲染用户列表
    static renderUserList() {
        const userList = document.getElementById('userList');
        if (!userList) return;
        
        let html = '';
        this.users.forEach(user => {
            html += `
                <tr>
                    <td><input type="checkbox"></td>
                    <td>${user.id}</td>
                    <td>${user.username}</td>
                    <td>${user.email}</td>
                    <td>${this.formatRole(user.role)}</td>
                    <td>
                        <span class="status-badge ${user.status ? 'inactive' : 'active'}">
                            ${user.status ? '禁用' : '启用'}
                        </span>
                    </td>
                    <td>${user.created_at}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-edit" onclick="UserManager.editUser(${user.id})">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-delete" onclick="UserManager.deleteUser(${user.id})">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        userList.innerHTML = html || '<tr><td colspan="8" class="empty-message">暂无用户数据</td></tr>';
        
        // 更新分页
        this.updatePagination();
    }

    // 更新分页
    static updatePagination() {
        const totalPages = Math.ceil(this.pageConfig.total / this.pageConfig.pageSize);
        renderPagination(totalPages, this.pageConfig.total);
    }

    // 格式化角色显示
    static formatRole(role) {
        return role === 0 ? '管理员' : '普通用户';
    }

    // 初始化方法
    static async init() {
        try {
            await this.fetchUsers();
            
            // 绑定事件
            const addUserBtn = document.querySelector('.btn-primary');
            if (addUserBtn) {
                addUserBtn.addEventListener('click', () => showModal('添加用户'));
            }

            const closeBtn = document.querySelector('.close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', hideModal);
            }

            const form = document.getElementById('userForm');
            if (form) {
                form.addEventListener('submit', (e) => this.handleSubmit(e));
            }
        } catch (error) {
            console.error('初始化用户管理页面失败:', error);
            MessageBox.error('初始化页面失败');
        }
    }

    // 编辑用户
    static editUser(id) {
        const user = this.users.find(u => u.id === id);
        if (user) {
            showModal('编辑用户');
            const form = document.querySelector('#userForm');
            if (form) {
                form.dataset.userId = user.id;  // 保存用户ID到表单
                form.username.value = user.username;
                form.email.value = user.email;
                form.role.value = user.role;
                form.status.value = user.status;
                // 清空密码字段
                form.password.value = '';
            }
        }
    }

    // 删除用户
    static deleteUser(id) {
        if (confirm('确定要删除该用户吗？')) {
            const index = this.users.findIndex(u => u.id === id);
            if (index > -1) {
                this.users.splice(index, 1);
                this.renderUserList();
            }
        }
    }

    // 添加用户
    static async addUser(userData) {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('未找到登录凭证');
            }

            const response = await fetch(`${window.baseURL}/api/register`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || '添加用户失败');
            }

            console.log('添加用户成功:', data);
            MessageBox.success('添加用户成功');
            await this.refreshPage(); // 刷新用户列表
            return data;
        } catch (error) {
            console.error('添加用户错误:', error);
            MessageBox.error(error.message);
            throw error;
        }
    }

    // 修改表单提交处理
    static async handleSubmit(e) {
        e.preventDefault();
        try {
            const form = e.target;
            const userData = {
                username: form.username.value,
                email: form.email.value,
                password: form.password.value,
                role: parseInt(form.role.value),
                status: parseInt(form.status.value)
            };

            if (!form.dataset.userId) {
                // 新增用户
                await UserManager.addUser(userData);
                hideModal();
            } else {
                // 更新用户
                const userId = parseInt(form.dataset.userId);
                await UserManager.updateUser(userId, userData);
                hideModal();
                MessageBox.success('更新用户成功');
            }
        } catch (error) {
            MessageBox.error(error.message);
        }
    }

    // 更新用户
    static async updateUser(userId, userData) {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('未找到登录凭证');
            }

            const response = await fetch(`${window.baseURL}/api/users/${userId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || '更新用户失败');
            }

            console.log('更新用户成功:', data);
            await this.refreshPage(); // 刷新用户列表
            return data;
        } catch (error) {
            console.error('更新用户错误:', error);
            throw error;
        }
    }
}

// 修改筛选函数
function filterUsers(type, value) {
    UserManager.filters[type] = value;
    UserManager.pageConfig.currentPage = 1; // 重置页码
    UserManager.refreshPage();
}

// 修改搜索函数
function searchUsers(keyword) {
    UserManager.searchKeyword = keyword;
    UserManager.pageConfig.currentPage = 1; // 重置页码
    UserManager.refreshPage();
}

// 修改页面初始化函数
async function initPage() {
    try {
        await UserManager.init();
    } catch (error) {
        console.error('初始化页面失败:', error);
        MessageBox.error('页面初始化失败');
    }
}

// 修改切换页码函数
function changePage(page) {
    UserManager.pageConfig.currentPage = page;
    UserManager.fetchUsers();
}

// 渲染分控件
function renderPagination(totalPages, totalItems) {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;
    
    let paginationHTML = `
        <div class="pagination-info">共 ${totalItems} 条记录，每页 ${UserManager.pageConfig.pageSize} 条</div>
        <div class="pagination-buttons">
    `;
    
    // 上一页按钮
    paginationHTML += `
        <button class="btn-page" 
                onclick="changePage(${UserManager.pageConfig.currentPage - 1})"
                ${UserManager.pageConfig.currentPage === 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i>
        </button>
    `;
    
    // 页码按钮
    for (let i = 1; i <= totalPages; i++) {
        paginationHTML += `
            <button class="btn-page ${i === UserManager.pageConfig.currentPage ? 'active' : ''}"
                    onclick="changePage(${i})">
                ${i}
            </button>
        `;
    }
    
    // 下一页按钮
    paginationHTML += `
        <button class="btn-page" 
                onclick="changePage(${UserManager.pageConfig.currentPage + 1})"
                ${UserManager.pageConfig.currentPage === totalPages ? 'disabled' : ''}>
            <i class="fas fa-chevron-right"></i>
        </button>
    </div>`;
    
    pagination.innerHTML = paginationHTML;
}

// 显示模态框
function showModal(title) {
    const modal = document.querySelector('.modal');
    const modalTitle = document.querySelector('.modal-header h3');
    const passwordInput = document.querySelector('#password');
    
    if (modal && modalTitle) {
        modal.classList.add('show');
        
        // 重置表单
        const form = document.querySelector('#userForm');
        if (form) {
            form.reset();
            // 根据标题判断是添加还是编辑
            if (title === '编辑用户') {
                passwordInput.removeAttribute('required');
                passwordInput.placeholder = '不修改请留空';
            } else {
                passwordInput.setAttribute('required', 'required');
                passwordInput.placeholder = '';
            }
        }
    }
}

// 隐藏模态框
function hideModal() {
    const modal = document.querySelector('.modal');
    if (modal) {
        modal.classList.add('closing');
        // 等待动画完成后再隐藏
        setTimeout(() => {
            modal.classList.remove('show', 'closing');
        }, 300); // 与 CSS 动画时长匹配
    }
}

// 导出始化函数
window.initPage = initPage; 