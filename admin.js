document.addEventListener('DOMContentLoaded', () => {
    // ---- Auth Logic ----
    const loginScreen = document.getElementById('loginScreen');
    const adminApp = document.getElementById('adminApp');
    const loginInput = document.getElementById('loginInput');
    const passwordInput = document.getElementById('passwordInput');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const currentUserName = document.getElementById('currentUserName');
    const passwordsBtnSidebar = document.getElementById('passwordsBtnSidebar');
    const passwordsModal = document.getElementById('passwordsModal');
    
    function getAdminUsers() {
        return JSON.parse(localStorage.getItem('elata_admin_users_v2')) || [];
    }
    function saveAdminUsers(users) {
        localStorage.setItem('elata_admin_users_v2', JSON.stringify(users));
    }

    function checkAuth() {
        const user = sessionStorage.getItem('elata_logged_in_user');
        const mobileNavPasswords = document.getElementById('mobileNavPasswords');
        if (user) {
            loginScreen.style.display = 'none';
            adminApp.style.display = 'flex';
            currentUserName.textContent = user;
            if (user === 'Admin') {
                passwordsBtnSidebar.style.display = 'flex';
                if (mobileNavPasswords) mobileNavPasswords.style.display = 'flex';
            } else {
                passwordsBtnSidebar.style.display = 'none';
                if (mobileNavPasswords) mobileNavPasswords.style.display = 'none';
            }
        } else {
            loginScreen.style.display = 'flex';
            adminApp.style.display = 'none';
        }
    }

    loginBtn.addEventListener('click', () => {
        const login = loginInput.value.trim();
        const pass = passwordInput.value.trim();
        
        if (login === 'Admin' && pass === 'Elata00Aparts00') {
            sessionStorage.setItem('elata_logged_in_user', 'Admin');
            checkAuth();
            loginInput.value = '';
            passwordInput.value = '';
            return;
        }

        const users = getAdminUsers();
        const found = users.find(u => u.login === login && u.password === pass);
        if (found) {
            sessionStorage.setItem('elata_logged_in_user', login);
            checkAuth();
            loginInput.value = '';
            passwordInput.value = '';
        } else {
            alert('Невірний логін або пароль!');
        }
    });

    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('elata_logged_in_user');
        checkAuth();
    });

    checkAuth(); // Initial check

    // ---- Passwords Modal Logic ----
    const closePasswordsModal = document.getElementById('closePasswordsModal');
    const usersList = document.getElementById('usersList');
    const newLogin = document.getElementById('newLogin');
    const newPassword = document.getElementById('newPassword');
    const addUserBtn = document.getElementById('addUserBtn');

    function renderUsersList() {
        if (!usersList) return;
        usersList.innerHTML = '';
        const users = getAdminUsers();
        users.forEach((u, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${u.login}</td>
                <td>${u.password}</td>
                <td>
                    <button class="btn-outline btn-sm delete-user-btn" data-index="${index}" style="color: red; border-color: red; padding: 0.2rem 0.5rem;">Видалити</button>
                </td>
            `;
            usersList.appendChild(tr);
        });

        document.querySelectorAll('.delete-user-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if(confirm('Видалити цього користувача?')) {
                    const idx = parseInt(e.target.getAttribute('data-index'));
                    let users = getAdminUsers();
                    users = users.filter((_, i) => i !== idx);
                    saveAdminUsers(users);
                    renderUsersList();
                }
            });
        });
    }

    if (passwordsBtnSidebar) {
        passwordsBtnSidebar.addEventListener('click', (e) => {
            e.preventDefault();
            renderUsersList();
            passwordsModal.classList.add('active');
            setActiveTab('mobileNavPasswords');
        });
    }

    if (closePasswordsModal) {
        closePasswordsModal.addEventListener('click', () => {
            passwordsModal.classList.remove('active');
            setActiveTab('mobileNavBookings');
        });
    }

    if (addUserBtn) {
        addUserBtn.addEventListener('click', () => {
            const l = newLogin.value.trim();
            const p = newPassword.value.trim();
            if(!l || !p) return alert('Введіть логін і пароль');
            if(l === 'Admin') return alert('Логін Admin зарезервовано');
            
            const users = getAdminUsers();
            if(users.some(u => u.login === l)) return alert('Користувач з таким логіном вже існує');
            
            users.push({ login: l, password: p });
            saveAdminUsers(users);
            renderUsersList();
            newLogin.value = '';
            newPassword.value = '';
        });
    }

    // ---- Mobile Tab Navigation State Sync ----
    const mobileNavBookings = document.getElementById('mobileNavBookings');
    const mobileNavDates = document.getElementById('mobileNavDates');
    const mobileNavPasswords = document.getElementById('mobileNavPasswords');

    function setActiveTab(tabId) {
        document.querySelectorAll('.mobile-nav-item').forEach(item => {
            item.classList.remove('active');
        });
        const activeItem = document.getElementById(tabId);
        if (activeItem) {
            activeItem.classList.add('active');
        }
    }

    if (mobileNavBookings) {
        mobileNavBookings.addEventListener('click', (e) => {
            e.preventDefault();
            if (datesModal) datesModal.classList.remove('active');
            if (passwordsModal) passwordsModal.classList.remove('active');
            if (modal) modal.classList.remove('active');
            setActiveTab('mobileNavBookings');
        });
    }

    if (mobileNavDates) {
        mobileNavDates.addEventListener('click', (e) => {
            e.preventDefault();
            if (passwordsModal) passwordsModal.classList.remove('active');
            if (modal) modal.classList.remove('active');
            renderBlockedDates();
            datesModal.classList.add('active');
            setActiveTab('mobileNavDates');
        });
    }

    if (mobileNavPasswords) {
        mobileNavPasswords.addEventListener('click', (e) => {
            e.preventDefault();
            if (datesModal) datesModal.classList.remove('active');
            if (modal) modal.classList.remove('active');
            renderUsersList();
            passwordsModal.classList.add('active');
            setActiveTab('mobileNavPasswords');
        });
    }

    // ---- Cloud Database Hybrid Sync ----
    let isPushing = false;
    let isSyncing = false;

    async function syncWithCloud() {
        if (isPushing || isSyncing) return {
            bookings: JSON.parse(localStorage.getItem('elata_bookings_v2')) || [],
            blocked_dates: JSON.parse(localStorage.getItem('elata_blocked_dates_v2')) || []
        };
        isSyncing = true;
        try {
            const res = await fetch('/api/data');
            if (!res.ok) throw new Error('API error');
            const cloudData = await res.json();

            let cloudBookings = cloudData.bookings || [];
            let cloudBlocked = cloudData.blocked_dates || [];

            // Read tombstones (deleted booking IDs)
            const deletedIds = JSON.parse(localStorage.getItem('elata_deleted_bookings')) || [];
            const deletedSet = new Set(deletedIds.map(id => id.toString()));

            if (deletedSet.size > 0) {
                // Filter out tombstoned bookings from cloud data
                const filteredBookings = cloudBookings.filter(b => b && b.id && !deletedSet.has(b.id.toString()));

                // If we actually removed something, push the cleaned list back to cloud
                if (filteredBookings.length < cloudBookings.length) {
                    const putRes = await fetch('/api/data', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ bookings: filteredBookings, blocked_dates: cloudBlocked })
                    });
                    if (putRes.ok) {
                        // Only clear tombstones AFTER successful cloud write
                        localStorage.setItem('elata_deleted_bookings', JSON.stringify([]));
                    }
                    cloudBookings = filteredBookings;
                } else {
                    // Tombstones exist but nothing to remove (already deleted) — safe to clear
                    localStorage.setItem('elata_deleted_bookings', JSON.stringify([]));
                }
            }

            // Cloud is the single source of truth — overwrite local cache
            localStorage.setItem('elata_bookings_v2', JSON.stringify(cloudBookings));
            localStorage.setItem('elata_blocked_dates_v2', JSON.stringify(cloudBlocked));

            return { bookings: cloudBookings, blocked_dates: cloudBlocked };
        } catch (e) {
            console.warn("Cloud sync failed, using localStorage cache", e);
            return {
                bookings: JSON.parse(localStorage.getItem('elata_bookings_v2')) || [],
                blocked_dates: JSON.parse(localStorage.getItem('elata_blocked_dates_v2')) || []
            };
        } finally {
            isSyncing = false;
        }
    }

    async function pushToCloud() {
        if (isPushing) return;
        isPushing = true;
        try {
            // Atomic: read fresh cloud state, apply local changes, write back
            const getRes = await fetch('/api/data');
            if (!getRes.ok) throw new Error('Failed to read cloud');
            const cloudData = await getRes.json();

            let bookings = cloudData.bookings || [];

            // Apply tombstones to ensure deleted items never come back
            const deletedIds = JSON.parse(localStorage.getItem('elata_deleted_bookings')) || [];
            const deletedSet = new Set(deletedIds.map(id => id.toString()));
            if (deletedSet.size > 0) {
                bookings = bookings.filter(b => b && b.id && !deletedSet.has(b.id.toString()));
            }

            // Apply local status changes (from the admin's in-memory bookings array)
            const localBookings = JSON.parse(localStorage.getItem('elata_bookings_v2')) || [];
            const localMap = new Map();
            localBookings.forEach(b => {
                if (b && b.id) localMap.set(b.id.toString(), b);
            });

            // Update cloud bookings with any local status changes
            bookings = bookings.map(b => {
                if (b && b.id && localMap.has(b.id.toString())) {
                    return localMap.get(b.id.toString());
                }
                return b;
            });

            // Set local blocked dates as authoritative (Fixes the zombie resurrection bug)
            const blocked_dates = JSON.parse(localStorage.getItem('elata_blocked_dates_v2')) || [];

            const putRes = await fetch('/api/data', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookings, blocked_dates })
            });

            if (putRes.ok) {
                // Only clear tombstones AFTER successful cloud write
                localStorage.setItem('elata_deleted_bookings', JSON.stringify([]));
                // Sync local cache with what we just wrote
                localStorage.setItem('elata_bookings_v2', JSON.stringify(bookings));
                localStorage.setItem('elata_blocked_dates_v2', JSON.stringify(blocked_dates));
            }
        } catch (e) {
            console.error("Failed to push to cloud", e);
        } finally {
            isPushing = false;
        }
    }

    const defaultBookings = [];
    let bookings = JSON.parse(localStorage.getItem('elata_bookings_v2')) || defaultBookings;

    const tableBody = document.getElementById('bookingsTableBody');
    const statNew = document.getElementById('statNew');
    const statConfirmed = document.getElementById('statConfirmed');
    const statTotal = document.getElementById('statTotal');

    const modal = document.getElementById('editModal');
    let currentEditId = null;

    function renderTable() {
        tableBody.innerHTML = '';
        let countNew = 0;
        let countConfirmed = 0;

        bookings.forEach(b => {
            if (b.status === 'Нове') countNew++;
            if (b.status === 'Підтверджено') countConfirmed++;

            const statusClass = b.status === 'Нове' ? 'status-new' :
                                b.status === 'Підтверджено' ? 'status-confirmed' : 'status-rejected';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${b.id}</td>
                <td><strong>${b.name}</strong></td>
                <td>${b.phone}</td>
                <td>${b.room}</td>
                <td>${b.dates}</td>
                <td>
                    <span class="status-badge ${statusClass}">${b.status}</span>
                    ${b.createdAt ? `<div style="font-size: 0.75rem; color: #a19280; margin-top: 0.25rem; font-weight: 500; font-family: 'Outfit', sans-serif;">${b.createdAt}</div>` : ''}
                </td>
                <td>
                    <button class="btn-outline btn-sm edit-btn" data-id="${b.id}">Деталі</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        // Update stats
        statNew.textContent = countNew;
        statConfirmed.textContent = countConfirmed;
        statTotal.textContent = bookings.length;

        // Attach event listeners to buttons
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                openModal(id);
            });
        });
    }

    function openModal(id) {
        const b = bookings.find(item => item && item.id && item.id.toString() === id.toString());
        if (!b) return;

        currentEditId = id;
        document.getElementById('modalId').textContent = b.id;
        document.getElementById('modalName').value = b.name;
        document.getElementById('modalPhone').value = b.phone;
        document.getElementById('modalRoom').value = b.room;
        document.getElementById('modalComment').value = b.comment;
        document.getElementById('modalCreatedAt').value = b.createdAt || 'Невідомо';
        document.getElementById('modalStatus').value = b.status;

        modal.classList.add('active');
    }

    function closeModal() {
        modal.classList.remove('active');
        currentEditId = null;
        setActiveTab('mobileNavBookings');
    }

    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('cancelModal').addEventListener('click', closeModal);

    document.getElementById('saveModal').addEventListener('click', () => {
        if (!currentEditId) return;

        const newStatus = document.getElementById('modalStatus').value;
        const bIndex = bookings.findIndex(item => item.id === currentEditId);
        
        if (bIndex > -1) {
            const oldStatus = bookings[bIndex].status;
            bookings[bIndex].status = newStatus;
            
            // Handle automatic date blocking
            if (newStatus === 'Підтверджено' && oldStatus !== 'Підтверджено') {
                const datesStr = bookings[bIndex].dates;
                if (datesStr) {
                    const roomName = bookings[bIndex].room ? bookings[bIndex].room.split(' (')[0] : 'Усі номери';
                    const parts = datesStr.split(' - ');
                    if (parts.length === 2) {
                        const startParts = parts[0].split('.');
                        const endParts = parts[1].split('.');
                        const startFormatted = `${startParts[2]}-${startParts[1]}-${startParts[0]}`;
                        const endFormatted = `${endParts[2]}-${endParts[1]}-${endParts[0]}`;
                        
                        const ranges = getBlockedDates();
                        const isDuplicate = ranges.some(r => r.start === startFormatted && r.end === endFormatted && (r.room === roomName || r.room === 'Усі номери'));
                        if (!isDuplicate) {
                            ranges.push({ start: startFormatted, end: endFormatted, room: roomName });
                            saveBlockedDates(ranges);
                            if (typeof renderBlockedDates === 'function') renderBlockedDates();
                        }
                    }
                }
            } else if (newStatus === 'Відхилено' || (oldStatus === 'Підтверджено' && newStatus !== 'Підтверджено')) {
                // If they undo the confirmation
                const datesStr = bookings[bIndex].dates;
                if (datesStr) {
                    const roomName = bookings[bIndex].room ? bookings[bIndex].room.split(' (')[0] : 'Усі номери';
                    const parts = datesStr.split(' - ');
                    if (parts.length === 2) {
                        const startParts = parts[0].split('.');
                        const endParts = parts[1].split('.');
                        const startFormatted = `${startParts[2]}-${startParts[1]}-${startParts[0]}`;
                        const endFormatted = `${endParts[2]}-${endParts[1]}-${endParts[0]}`;
                        
                        let ranges = getBlockedDates();
                        ranges = ranges.filter(r => !(r.start === startFormatted && r.end === endFormatted && r.room === roomName));
                        saveBlockedDates(ranges);
                        if (typeof renderBlockedDates === 'function') renderBlockedDates();
                    }
                }
            }

            localStorage.setItem('elata_bookings_v2', JSON.stringify(bookings));
            pushToCloud();
            renderTable();
            closeModal();
        }
    });

    document.getElementById('refreshBtn').addEventListener('click', () => {
        syncWithCloud().then(data => {
            bookings = data.bookings;
            renderTable();
        });
    });

    // Delete Booking Logic
    document.getElementById('deleteBookingBtn').addEventListener('click', () => {
        if (!currentEditId) return;
        if (confirm('Ви впевнені, що хочете видалити цю заявку?')) {
            const bookingToDelete = bookings.find(item => item.id === currentEditId);
            
            // If the booking is deleted, unblock its dates!
            if (bookingToDelete && bookingToDelete.dates) {
                const datesStr = bookingToDelete.dates;
                const roomName = bookingToDelete.room ? bookingToDelete.room.split(' (')[0] : 'Усі номери';
                const parts = datesStr.split(' - ');
                if (parts.length === 2) {
                    const startParts = parts[0].split('.');
                    const endParts = parts[1].split('.');
                    const startFormatted = `${startParts[2]}-${startParts[1]}-${startParts[0]}`;
                    const endFormatted = `${endParts[2]}-${endParts[1]}-${endParts[0]}`;
                    
                    let ranges = getBlockedDates();
                    ranges = ranges.filter(r => !(r.start === startFormatted && r.end === endFormatted && r.room === roomName));
                    saveBlockedDates(ranges);
                    if (typeof renderBlockedDates === 'function') renderBlockedDates();
                }
            }

            // Add to tombstones list in localStorage
            let deletedIds = JSON.parse(localStorage.getItem('elata_deleted_bookings')) || [];
            if (!deletedIds.includes(currentEditId.toString())) {
                deletedIds.push(currentEditId.toString());
                localStorage.setItem('elata_deleted_bookings', JSON.stringify(deletedIds));
            }

            bookings = bookings.filter(item => item.id !== currentEditId);
            localStorage.setItem('elata_bookings_v2', JSON.stringify(bookings));
            pushToCloud();
            renderTable();
            closeModal();
        }
    });

    // Blocked Dates Logic
    const datesModal = document.getElementById('datesModal');
    const manageDatesBtnSidebar = document.getElementById('manageDatesBtnSidebar');
    const closeDatesModalBtn = document.getElementById('closeDatesModal');
    const blockStartDate = document.getElementById('blockStartDate');
    const blockEndDate = document.getElementById('blockEndDate');
    const addBlockDateBtn = document.getElementById('addBlockDateBtn');
    const blockedDatesList = document.getElementById('blockedDatesList');

    // Set minimum date to today
    if (blockStartDate && blockEndDate) {
        const today = new Date().toISOString().split('T')[0];
        blockStartDate.setAttribute('min', today);
        blockEndDate.setAttribute('min', today);
        
        // Make sure end date cannot be earlier than start date
        blockStartDate.addEventListener('change', (e) => {
            blockEndDate.setAttribute('min', e.target.value);
        });
    }

    function getBlockedDates() {
        return JSON.parse(localStorage.getItem('elata_blocked_dates_v2')) || [];
    }

    function saveBlockedDates(dates) {
        localStorage.setItem('elata_blocked_dates_v2', JSON.stringify(dates));
        pushToCloud();
    }

    function renderBlockedDates() {
        blockedDatesList.innerHTML = '';
        const ranges = getBlockedDates();
        
        // Sort by start date
        ranges.sort((a, b) => new Date(a.start) - new Date(b.start));

        ranges.forEach((range, index) => {
            const tr = document.createElement('tr');
            
            const tdRoom = document.createElement('td');
            tdRoom.textContent = range.room || 'Усі номери';
            
            const tdStart = document.createElement('td');
            tdStart.textContent = range.start;
            
            const tdEnd = document.createElement('td');
            tdEnd.textContent = range.end;
            
            const tdActions = document.createElement('td');
            const btn = document.createElement('button');
            btn.textContent = 'Відкрити';
            btn.className = 'btn-outline btn-sm';
            btn.style.padding = '0.2rem 0.5rem';
            btn.onclick = () => {
                const newRanges = getBlockedDates().filter((_, i) => i !== index);
                saveBlockedDates(newRanges);
                renderBlockedDates();
            };
            tdActions.appendChild(btn);
            
            tr.appendChild(tdRoom);
            tr.appendChild(tdStart);
            tr.appendChild(tdEnd);
            tr.appendChild(tdActions);
            blockedDatesList.appendChild(tr);
        });
    }

    if (manageDatesBtnSidebar) {
        manageDatesBtnSidebar.addEventListener('click', (e) => {
            e.preventDefault();
            renderBlockedDates();
            datesModal.classList.add('active');
            setActiveTab('mobileNavDates');
        });
    }

    if (closeDatesModalBtn) {
        closeDatesModalBtn.addEventListener('click', () => {
            datesModal.classList.remove('active');
            setActiveTab('mobileNavBookings');
        });
    }

    if (addBlockDateBtn) {
        addBlockDateBtn.addEventListener('click', () => {
            const startVal = blockStartDate.value;
            const endVal = blockEndDate.value;
            const roomVal = document.getElementById('blockRoomSelect').value;
            
            if (!startVal || !endVal) {
                alert('Будь ласка, введіть обидві дати.');
                return;
            }
            
            if (new Date(startVal) > new Date(endVal)) {
                alert('Дата початку не може бути пізніше дати кінця.');
                return;
            }

            const ranges = getBlockedDates();
            const isDuplicate = ranges.some(r => r.start === startVal && r.end === endVal && r.room === roomVal);
            
            if (!isDuplicate) {
                ranges.push({ start: startVal, end: endVal, room: roomVal });
                saveBlockedDates(ranges);
                blockStartDate.value = '';
                blockEndDate.value = '';
                renderBlockedDates();
            } else {
                alert('Цей період вже закритий для вибраного номера.');
            }
        });
    }

    // Close modals on outside click
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
            setActiveTab('mobileNavBookings');
        }
        if (e.target === datesModal) {
            datesModal.classList.remove('active');
            setActiveTab('mobileNavBookings');
        }
        if (e.target === passwordsModal) {
            passwordsModal.classList.remove('active');
            setActiveTab('mobileNavBookings');
        }
    });

    // Auto Refresh every 10 seconds from cloud
    setInterval(() => {
        if (isPushing || isSyncing) return;
        // Only refresh if modals are not active to prevent editing interference
        if (!modal.classList.contains('active') && !datesModal.classList.contains('active') && !passwordsModal.classList.contains('active')) {
            syncWithCloud().then(data => {
                if (data) {
                    bookings = data.bookings;
                    renderTable();
                }
            });
        }
    }, 10000);

    // Initial render and sync
    syncWithCloud().then(data => {
        bookings = data.bookings;
        renderTable();
    });
});
