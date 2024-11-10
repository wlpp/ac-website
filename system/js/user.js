// 模拟用户数据
const mockUsers = [
    {
        id: 1,
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin',
        status: 1,
        createTime: '2024-03-20 10:00:00'
    },
    {
        id: 2,
        username: 'john_doe',
        email: 'john@example.com',
        role: 'user',
        status: 1,
        createTime: '2024-03-20 10:30:00'
    },
    {
        id: 3,
        username: 'jane_smith',
        email: 'jane@example.com',
        role: 'user',
        status: 0,
        createTime: '2024-03-20 11:00:00'
    },
    {
        id: 4,
        username: 'manager',
        email: 'manager@example.com',
        role: 'admin',
        status: 1,
        createTime: '2024-03-20 11:30:00'
    },
    {
        id: 5,
        username: 'sarah_wilson',
        email: 'sarah@example.com',
        role: 'user',
        status: 1,
        createTime: '2024-03-20 12:00:00'
    },
    {
        id: 6,
        username: 'mike_brown',
        email: 'mike@example.com',
        role: 'user',
        status: 1,
        createTime: '2024-03-20 12:30:00'
    },
    {
        id: 7,
        username: 'lisa_taylor',
        email: 'lisa@example.com',
        role: 'user',
        status: 0,
        createTime: '2024-03-20 13:00:00'
    },
    {
        id: 8,
        username: 'tech_support',
        email: 'support@example.com',
        role: 'admin',
        status: 1,
        createTime: '2024-03-20 13:30:00'
    },
    {
        id: 9,
        username: 'david_miller',
        email: 'david@example.com',
        role: 'user',
        status: 1,
        createTime: '2024-03-20 14:00:00'
    },
    {
        id: 10,
        username: 'emma_davis',
        email: 'emma@example.com',
        role: 'user',
        status: 0,
        createTime: '2024-03-20 14:30:00'
    },
    {
        id: 11,
        username: 'super_admin',
        email: 'super@example.com',
        role: 'admin',
        status: 1,
        createTime: '2024-03-20 15:00:00'
    }
];

// 添加筛选条件对象
let filters = {
    role: '',
    status: ''
};

let searchKeyword = '';

// 添加分页配置
const pageConfig = {
    pageSize: 10,  // 每页显示数量
    currentPage: 1  // 当前页码
};

// 显示模态框
function showModal(title) {
    const modal = document.querySelector('.modal');
    const modalTitle = document.querySelector('.modal-header h3');
    
    if (modal && modalTitle) {
        modal.classList.add('show');
        modalTitle.textContent = title;
        
        // 重置表单
        const form = document.querySelector('#userForm');
        if (form) {
            form.reset();
        }
    }
}

// 隐藏模态框
function hideModal() {
    const modal = document.querySelector('.modal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// 筛选用户
function filterUsers(type, value) {
    filters[type] = value;
    applyFilters();
}

// 应用所有筛选条件
function applyFilters() {
    let filteredUsers = mockUsers.filter(user => {
        let matchRole = !filters.role || user.role === filters.role;
        let matchStatus = filters.status === '' || user.status.toString() === filters.status;
        let matchSearch = !searchKeyword || 
            user.username.toLowerCase().includes(searchKeyword.toLowerCase()) ||
            user.email.toLowerCase().includes(searchKeyword.toLowerCase());
        
        return matchRole && matchStatus && matchSearch;
    });
    
    renderUserList(filteredUsers);
}

// 搜索用户
function searchUsers(keyword) {
    searchKeyword = keyword;
    applyFilters();
}

// 渲染用户列表
function renderUserList(users) {
    const userList = document.getElementById('userList');
    if (!userList) return;
    
    const startIndex = (pageConfig.currentPage - 1) * pageConfig.pageSize;
    const endIndex = startIndex + pageConfig.pageSize;
    const pageUsers = users.slice(startIndex, endIndex);
    
    let html = '';
    pageUsers.forEach(user => {
        html += `
            <tr>
                <td><input type="checkbox"></td>
                <td>${user.id}</td>
                <td>${user.username}</td>
                <td>${user.email}</td>
                <td>${formatRole(user.role)}</td>
                <td>
                    <span class="status-badge ${user.status ? 'active' : 'inactive'}">
                        ${user.status ? '启用' : '禁用'}
                    </span>
                </td>
                <td>${user.createTime}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-edit" title="编辑" onclick="editUser(${user.id})">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-delete" title="删除" onclick="deleteUser(${user.id})">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    userList.innerHTML = html;
    
    const totalPages = Math.ceil(users.length / pageConfig.pageSize);
    renderPagination(totalPages, users.length);
}

// 编辑用户
function editUser(id) {
    const user = mockUsers.find(u => u.id === id);
    if (user) {
        showModal('编辑用户');
        const form = document.querySelector('#userForm');
        if (form) {
            form.username.value = user.username;
            form.email.value = user.email;
            form.role.value = user.role;
            form.status.value = user.status;
        }
    }
}

// 删除用户
function deleteUser(id) {
    if (confirm('确定要删除该用户吗？')) {
        const index = mockUsers.findIndex(u => u.id === id);
        if (index > -1) {
            mockUsers.splice(index, 1);
            renderUserList(mockUsers);
        }
    }
}

// 处理表单提交
function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const userData = {
        username: form.username.value,
        email: form.email.value,
        role: form.role.value,
        status: parseInt(form.status.value),
        createTime: new Date().toLocaleString()
    };

    // 如果是新用户，添加ID
    if (!form.dataset.userId) {
        userData.id = mockUsers.length + 1;
        mockUsers.push(userData);
    } else {
        // 更新现有用户
        const index = mockUsers.findIndex(u => u.id === parseInt(form.dataset.userId));
        if (index > -1) {
            mockUsers[index] = { ...mockUsers[index], ...userData };
        }
    }

    hideModal();
    renderUserList(mockUsers);
}

// 格式化角色
function formatRole(role) {
    const roles = {
        admin: '管理员',
        user: '用户'
    };
    return roles[role] || role;
}

// 页面初始化函数
function initPage() {
    // 重置分页配置
    pageConfig.currentPage = 1;
    
    // 渲染初始用户列表
    renderUserList(mockUsers);
    
    // 绑定添加用户按钮
    const addUserBtn = document.querySelector('.btn-primary');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', () => showModal('添加用户'));
    }

    // 绑定关闭按钮
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', hideModal);
    });

    // 绑定表单提交
    const userForm = document.querySelector('#userForm');
    if (userForm) {
        userForm.addEventListener('submit', handleSubmit);
    }

    // 绑定模态框外部点击关闭
    const modal = document.querySelector('.modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) hideModal();
        });
    }
}

// 导出始化函数
window.initPage = initPage; 

// 渲染分页控件
function renderPagination(totalPages, totalItems) {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;
    
    let paginationHTML = `
        <div class="pagination-info">共 ${totalItems} 条记录，每页 ${pageConfig.pageSize} 条</div>
        <div class="pagination-buttons">
    `;
    
    // 上一页按钮
    paginationHTML += `
        <button class="btn-page" 
                onclick="changePage(${pageConfig.currentPage - 1})"
                ${pageConfig.currentPage === 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i>
        </button>
    `;
    
    // 页码按钮
    for (let i = 1; i <= totalPages; i++) {
        paginationHTML += `
            <button class="btn-page ${i === pageConfig.currentPage ? 'active' : ''}"
                    onclick="changePage(${i})">
                ${i}
            </button>
        `;
    }
    
    // 下一页按钮
    paginationHTML += `
        <button class="btn-page" 
                onclick="changePage(${pageConfig.currentPage + 1})"
                ${pageConfig.currentPage === totalPages ? 'disabled' : ''}>
            <i class="fas fa-chevron-right"></i>
        </button>
    </div>`;
    
    pagination.innerHTML = paginationHTML;
}

// 切换页码
function changePage(page) {
    const totalPages = Math.ceil(UserManager.users.length / pageConfig.pageSize);  // 使用 UserManager.users
    if (page < 1 || page > totalPages) return;
    
    pageConfig.currentPage = page;
    UserManager.refreshPage();
} 