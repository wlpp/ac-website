// 菜单数据
let menus = [];
let currentEditId = null;

// 初始化菜单列表
function initMenuList() {
    // 模拟数据，实际项目中应该从后端获取
    menus = [
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
    renderMenuList();
}

// 渲染菜单列表
function renderMenuList() {
    const tbody = document.getElementById('menuList');
    if (!tbody) return;

    tbody.innerHTML = menus.map(menu => `
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
                <button class="btn-icon" onclick="editMenu(${menu.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon delete" onclick="deleteMenu(${menu.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// 显示添加菜单弹窗
function showAddMenuModal() {
    currentEditId = null;
    document.getElementById('modalTitle').textContent = '添加菜单';
    document.getElementById('menuForm').reset();
    document.getElementById('menuModal').style.display = 'block';
    updateParentMenuOptions();
}

// 显示编辑菜单弹窗
function editMenu(id) {
    currentEditId = id;
    const menu = menus.find(m => m.id === id);
    if (!menu) return;

    document.getElementById('modalTitle').textContent = '编辑菜单';
    const form = document.getElementById('menuForm');
    form.name.value = menu.name;
    form.url.value = menu.url;
    form.icon.value = menu.icon;
    form.parentId.value = menu.parentId;
    form.sort.value = menu.sort;
    form.status.value = menu.status;

    document.getElementById('menuModal').style.display = 'block';
    updateParentMenuOptions(id);
}

// 关闭菜单弹窗
function closeMenuModal() {
    document.getElementById('menuModal').style.display = 'none';
}

// 更新父级菜单选项
function updateParentMenuOptions(excludeId = null) {
    const select = document.querySelector('select[name="parentId"]');
    select.innerHTML = '<option value="0">无</option>';
    
    // 只显示顶级菜单作为可选的父级菜单
    const topMenus = menus.filter(m => m.parentId === 0 && m.id !== excludeId);
    topMenus.forEach(menu => {
        select.innerHTML += `<option value="${menu.id}">${menu.name}</option>`;
    });
}

// 保存菜单
function saveMenu() {
    const form = document.getElementById('menuForm');
    const menuData = {
        name: form.name.value,
        url: form.url.value,
        icon: form.icon.value,
        parentId: parseInt(form.parentId.value),
        sort: parseInt(form.sort.value),
        status: parseInt(form.status.value)
    };

    if (currentEditId) {
        // 编辑现有菜单
        const index = menus.findIndex(m => m.id === currentEditId);
        if (index !== -1) {
            menus[index] = { ...menus[index], ...menuData };
        }
    } else {
        // 添加新菜单
        menuData.id = Math.max(...menus.map(m => m.id), 0) + 1;
        menus.push(menuData);
    }

    renderMenuList();
    closeMenuModal();
}

// 删除菜单
function deleteMenu(id) {
    if (!confirm('确定要删除这个菜单吗？')) return;

    // 检查是否有子菜单
    const hasChildren = menus.some(m => m.parentId === id);
    if (hasChildren) {
        alert('请先删除该菜单的子菜单');
        return;
    }

    menus = menus.filter(m => m.id !== id);
    renderMenuList();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initMenuList);