document.addEventListener('DOMContentLoaded', () => {
    // ---- Cloud Database Hybrid Sync ----
    async function syncWithCloud() {
        try {
            const res = await fetch('/api/data');
            if (!res.ok) throw new Error('API error');
            const cloudData = await res.json();
            
            const cloudBookings = cloudData.bookings || [];
            const cloudBlocked = cloudData.blocked_dates || [];
            
            // Directly overwrite local cache with cloud truth to prevent client resurrection
            localStorage.setItem('elata_bookings_v2', JSON.stringify(cloudBookings));
            localStorage.setItem('elata_blocked_dates_v2', JSON.stringify(cloudBlocked));
        } catch (e) {
            console.warn("Cloud sync failed, using localStorage cache", e);
        }
    }

    async function pushToCloud(newBooking) {
        try {
            // Atomic read-modify-write: fetch fresh cloud state, append new booking, write back
            const getRes = await fetch('/api/data');
            if (!getRes.ok) throw new Error('Failed to read cloud');
            const cloudData = await getRes.json();

            let bookings = cloudData.bookings || [];
            let blocked_dates = cloudData.blocked_dates || [];

            // Only append the new booking if it doesn't already exist in cloud
            if (newBooking && newBooking.id) {
                const exists = bookings.some(b => b && b.id && b.id.toString() === newBooking.id.toString());
                if (!exists) {
                    bookings.push(newBooking);
                }
            }

            await fetch('/api/data', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookings, blocked_dates })
            });

            // Update local cache with the authoritative cloud state
            localStorage.setItem('elata_bookings_v2', JSON.stringify(bookings));
            localStorage.setItem('elata_blocked_dates_v2', JSON.stringify(blocked_dates));
        } catch (e) {
            console.error("Failed to push to cloud", e);
        }
    }

    // Fetch blocked dates from localStorage
    function getBlockedDates() {
        return JSON.parse(localStorage.getItem('elata_blocked_dates_v2')) || [];
    }

    function isDateBlocked(dateStr, room) {
        let blockedRanges = getBlockedDates();
        
        blockedRanges = blockedRanges.filter(range => {
            if (!range) return false;
            if (!range.room) return true;
            if (range.room === 'Усі номери') return true;
            if (room && range.room === room) return true;
            return false;
        });

        const checkDate = new Date(dateStr);
        checkDate.setHours(0, 0, 0, 0);
        return blockedRanges.some(range => {
            if (typeof range === 'string') {
                const legacyDate = new Date(range);
                legacyDate.setHours(0, 0, 0, 0);
                return checkDate.getTime() === legacyDate.getTime();
            }
            const start = new Date(range.start);
            start.setHours(0, 0, 0, 0);
            const end = new Date(range.end);
            end.setHours(0, 0, 0, 0);
            return checkDate >= start && checkDate <= end;
        });
    }

    function checkDatesRange(startStr, endStr, room) {
        const start = new Date(startStr);
        const end = new Date(endStr);
        for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            if (isDateBlocked(dateStr, room)) {
                return dateStr;
            }
        }
        return null;
    }

    // 1. Preloader
    const preloader = document.querySelector('.preloader');
    if (preloader) {
        setTimeout(() => {
            preloader.classList.add('preloader-hidden');
        }, 800); // Small delay to show brand logo

        preloader.addEventListener('transitionend', () => {
            preloader.style.display = 'none';
        });
    }

    // 2. Booking Form Simulation
    const bookingForm = document.getElementById('bookingForm');
    const phoneInput = document.getElementById('phone');

    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            // Allow only digits, plus, space, parentheses, and dashes (remove letters)
            e.target.value = e.target.value.replace(/[^\d\+\-\(\)\s]/g, '');
        });
    }

    if (bookingForm) {
        bookingForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('name').value;
            const phone = document.getElementById('phone').value;
            const checkin = selectedCheckinVal;
            const checkout = selectedCheckoutVal;
            const room = selectedRoomVal;
            
            const adultsVal = document.getElementById('bookingAdults').value;
            const childrenVal = document.getElementById('bookingChildren').value;
            
            let adultsText = adultsVal === "more_adults" ? "4+ дор." : `${adultsVal} дор.`;
            let childrenText = "";
            if (childrenVal !== "0") {
                childrenText = childrenVal === "more_children" ? ", 3+ діт." : `, ${childrenVal} діт.`;
            }
            const guestsCombined = `${adultsText}${childrenText}`;

            // Phone validation
            const digitsOnly = phone.replace(/[^\d]/g, '');
            if (digitsOnly.length < 10 || digitsOnly.length > 12) {
                alert('Будь ласка, введіть коректний номер телефону (мінімум 10 цифр, наприклад: 098... або +380...).');
                return;
            }

            if (!checkin || !checkout) {
                alert('Будь ласка, виберіть дати заїзду та виїзду на календарі.');
                return;
            }

            if (new Date(checkin) >= new Date(checkout)) {
                alert('Дата виїзду повинна бути пізніше дати заїзду.');
                return;
            }

            const blockedInBetween = checkDatesRange(checkin, checkout, room);
            if (blockedInBetween) {
                alert(`На жаль, період бронювання включає заброньовану дату: ${blockedInBetween}. Будь ласка, оберіть інші дати.`);
                return;
            }

            const btn = bookingForm.querySelector('.btn-submit');
            const originalText = btn.innerText;
            btn.innerText = 'Надсилаємо...';
            btn.style.opacity = '0.8';
            btn.disabled = true;

            try {
                // Отримуємо існуючі бронювання з localStorage
                let existingBookings = JSON.parse(localStorage.getItem('elata_bookings_v2')) || [];
                
                // Генеруємо випадковий ID
                const newId = Math.floor(1000 + Math.random() * 9000).toString();
                
                // Форматуємо дати (з YYYY-MM-DD в DD.MM.YYYY)
                const formatDate = (dateString) => {
                    const d = new Date(dateString);
                    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
                };
                const formattedDates = `${formatDate(checkin)} - ${formatDate(checkout)}`;
                
                // Створюємо об'єкт бронювання
                const newBooking = {
                    id: newId,
                    name: name,
                    phone: phone,
                    room: `${room} (${guestsCombined})`,
                    dates: formattedDates,
                    status: 'Нове',
                    comment: 'Бронювання з головної сторінки'
                };

                // Атомарно додаємо нове бронювання в хмару (pushToCloud оновить і локальний кеш)
                await pushToCloud(newBooking);

                alert('Дякуємо! Ваше бронювання надіслано менеджеру. Дати будуть зарезервовані після підтвердження заявки.');
                bookingForm.reset();
                
                // Скидаємо календар
                if (fpInline) {
                    fpInline.clear();
                }
                selectedCheckinVal = "";
                selectedCheckoutVal = "";
                btnGoToStep2.disabled = true;
                dateRecapText.innerText = "Дати ще не обрано";
                
                // Закриваємо модалку
                closeModal();
            } catch (err) {
                console.error(err);
                alert('Сталася помилка при збереженні бронювання. Спробуйте пізніше.');
            } finally {
                btn.innerText = originalText;
                btn.style.opacity = '1';
                btn.disabled = false;
            }
        });
    }

    // ---- 2-Step Booking Wizard Controller ----
    let selectedRoomVal = "Двомісний номер";
    let selectedRoomPrice = 880;
    let selectedRoomImage = "DSC08330.JPG";
    let selectedRoomCapacity = "1–2 особи";
    let selectedRoomDesc = "Затишний номер з великим ліжком, власною ванною та телевізором.";

    let selectedCheckinVal = "";
    let selectedCheckoutVal = "";
    let fpInline = null;

    const btnGoToStep2 = document.getElementById('btnGoToStep2');
    const btnBackToStep1 = document.getElementById('btnBackToStep1');
    const step1Panel = document.getElementById('bookingStep1');
    const step2Panel = document.getElementById('bookingStep2');
    const indicatorStep1 = document.getElementById('indicatorStep1');
    const indicatorStep2 = document.getElementById('indicatorStep2');
    const dateRecapText = document.getElementById('dateRecapText');

    function setStep2ButtonsDisabled(disabled) {
        if (btnGoToStep2) btnGoToStep2.disabled = disabled;
    }

    // Toggle calendar popup overlay
    function openCalendar() {
        const calendarWrapper = document.getElementById('inlineCalendarWrapper');
        const calendarOverlay = document.getElementById('calendarOverlay');
        const inspectorPanel = document.querySelector('.room-inspector-panel');
        
        if (calendarWrapper) calendarWrapper.classList.remove('hidden');
        if (calendarOverlay) calendarOverlay.classList.add('active');
        if (inspectorPanel) inspectorPanel.classList.add('calendar-active');
    }

    function closeCalendar() {
        const calendarWrapper = document.getElementById('inlineCalendarWrapper');
        const calendarOverlay = document.getElementById('calendarOverlay');
        const inspectorPanel = document.querySelector('.room-inspector-panel');
        
        if (calendarWrapper) calendarWrapper.classList.add('hidden');
        if (calendarOverlay) calendarOverlay.classList.remove('active');
        if (inspectorPanel) inspectorPanel.classList.remove('calendar-active');
    }

    // Update Inline Calendar with active room blocked dates
    function updateInlineCalendar() {
        const calendarContainer = document.getElementById('inlineCalendarContainer');
        if (!calendarContainer || typeof flatpickr === 'undefined') return;

        // Clear existing flatpickr instance
        if (fpInline) {
            fpInline.destroy();
            fpInline = null;
        }

        const allRanges = getBlockedDates();
        const relevantRanges = allRanges.filter(range => {
            if (!range) return false;
            if (!range.room) return true; // Legacy dates without room
            if (range.room === 'Усі номери') return true; // Blocked globally
            if (selectedRoomVal && range.room === selectedRoomVal) return true; // Blocked for selected room
            return false;
        });

        const blockedRanges = relevantRanges.map(range => {
            if (typeof range === 'string') {
                return range;
            }
            return {
                from: range.start,
                to: range.end
            };
        });

        // Initialize inline range flatpickr
        fpInline = flatpickr(calendarContainer, {
            inline: true,
            mode: "range",
            minDate: "today",
            disable: blockedRanges,
            dateFormat: "Y-m-d",
            locale: "uk",
            defaultDate: selectedCheckinVal && selectedCheckoutVal ? [selectedCheckinVal, selectedCheckoutVal] : [],
            onDayCreate: function(dObj, dStr, fp, dayElem) {
                const checkDate = new Date(dayElem.dateObj);
                checkDate.setHours(0, 0, 0, 0);
                
                const isBlocked = blockedRanges.some(range => {
                    if (typeof range === 'string') {
                        const legacyDate = new Date(range);
                        legacyDate.setHours(0, 0, 0, 0);
                        return checkDate.getTime() === legacyDate.getTime();
                    }
                    const start = new Date(range.from);
                    start.setHours(0, 0, 0, 0);
                    const end = new Date(range.to);
                    end.setHours(0, 0, 0, 0);
                    return checkDate >= start && checkDate <= end;
                });
                
                if (isBlocked) {
                    dayElem.classList.add('custom-blocked-date');
                }
            },
            onChange: function(selectedDates) {
                const checkinInputElem = document.getElementById('checkinPlaceholder');
                const checkoutInputElem = document.getElementById('checkoutPlaceholder');
                
                const formatYMD = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                const formatDateText = (d) => {
                    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
                };

                if (selectedDates.length === 1) {
                    const start = selectedDates[0];
                    if (checkinInputElem) {
                        checkinInputElem.innerText = formatDateText(start);
                        checkinInputElem.classList.remove('is-placeholder');
                    }
                    if (checkoutInputElem) {
                        checkoutInputElem.innerText = "Оберіть виїзд";
                        checkoutInputElem.classList.add('is-placeholder');
                    }
                    selectedCheckinVal = formatYMD(start);
                    selectedCheckoutVal = "";
                    setStep2ButtonsDisabled(true);
                    dateRecapText.innerText = "Оберіть дату виїзду";
                } else if (selectedDates.length === 2) {
                    const start = selectedDates[0];
                    const end = selectedDates[1];

                    // Standardize local date strings
                    const startStr = formatYMD(start);
                    const endStr = formatYMD(end);

                    // Check if range contains blocked dates
                    const blockedDateInBetween = checkDatesRange(startStr, endStr, selectedRoomVal);
                    if (blockedDateInBetween) {
                        alert(`На жаль, цей період включає вже заброньовану дату: ${blockedDateInBetween}. Оберіть інший період.`);
                        fpInline.clear();
                        selectedCheckinVal = "";
                        selectedCheckoutVal = "";
                        setStep2ButtonsDisabled(true);
                        dateRecapText.innerText = "Дати ще не обрано";
                        return;
                    }

                    selectedCheckinVal = startStr;
                    selectedCheckoutVal = endStr;
                    setStep2ButtonsDisabled(false);

                    if (checkinInputElem) {
                        checkinInputElem.innerText = formatDateText(start);
                        checkinInputElem.classList.remove('is-placeholder');
                    }
                    if (checkoutInputElem) {
                        checkoutInputElem.innerText = formatDateText(end);
                        checkoutInputElem.classList.remove('is-placeholder');
                    }

                    // Auto-hide calendar after selection
                    setTimeout(() => {
                        closeCalendar();
                    }, 400);

                    // Calculate nights
                    const diffTime = Math.abs(end - start);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    const formatDateUk = (date) => {
                        const months = ['січ.', 'лют.', 'берез.', 'квіт.', 'трав.', 'черв.', 'лип.', 'серп.', 'верес.', 'жовт.', 'лист.', 'груд.'];
                        return `${date.getDate()} ${months[date.getMonth()]}`;
                    };

                    dateRecapText.innerHTML = `<span style="color: #27ae60; font-weight: 600;">Обрано:</span> ${formatDateUk(start)} — ${formatDateUk(end)} (${diffDays} ${diffDays === 1 ? 'ніч' : diffDays < 5 ? 'ночі' : 'ночей'})`;

                    // Update Step 2 Summary Recaps
                    const recapDates = document.getElementById('recapDates');
                    const recapNights = document.getElementById('recapNights');
                    const recapTotalPrice = document.getElementById('recapTotalPrice');

                    if (recapDates) recapDates.innerText = `${start.getDate().toString().padStart(2, '0')}.${(start.getMonth() + 1).toString().padStart(2, '0')}.${start.getFullYear()} - ${end.getDate().toString().padStart(2, '0')}.${(end.getMonth() + 1).toString().padStart(2, '0')}.${end.getFullYear()}`;
                    if (recapNights) recapNights.innerText = `${diffDays} ${diffDays === 1 ? 'ніч' : diffDays < 5 ? 'ночі' : 'ночей'}`;
                    if (recapTotalPrice) {
                        const total = diffDays * selectedRoomPrice;
                        recapTotalPrice.innerText = `${total.toLocaleString()} грн`;
                    }
                } else {
                    selectedCheckinVal = "";
                    selectedCheckoutVal = "";
                    setStep2ButtonsDisabled(true);
                    dateRecapText.innerText = "Дати ще не обрано";
                    
                    const checkinInputElem = document.getElementById('checkinPlaceholder');
                    const checkoutInputElem = document.getElementById('checkoutPlaceholder');
                    if (checkinInputElem) {
                        checkinInputElem.innerText = "22.05.2026";
                        checkinInputElem.classList.add('is-placeholder');
                    }
                    if (checkoutInputElem) {
                        checkoutInputElem.innerText = "28.05.2026";
                        checkoutInputElem.classList.add('is-placeholder');
                    }
                    closeCalendar();
                }
            }
        });
    }

    // Toggle calendar popup
    const checkinCol = document.getElementById('checkinCol');
    const checkoutCol = document.getElementById('checkoutCol');
    const calendarOverlay = document.getElementById('calendarOverlay');
    const inlineCalendarWrapper = document.getElementById('inlineCalendarWrapper');

    if (checkinCol && checkoutCol) {
        const onDateInputClick = (e) => {
            e.stopPropagation();
            openCalendar();
        };
        checkinCol.addEventListener('click', onDateInputClick);
        checkoutCol.addEventListener('click', onDateInputClick);
    }

    if (calendarOverlay) {
        calendarOverlay.addEventListener('click', (e) => {
            e.stopPropagation();
            closeCalendar();
        });
    }

    if (inlineCalendarWrapper) {
        // Prevent closing when clicking inside the calendar itself
        inlineCalendarWrapper.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // Close calendar when clicking anywhere else
    document.addEventListener('click', () => {
        closeCalendar();
    });

    // Connect Mini Card Clicks
    const roomMiniCards = document.querySelectorAll('.room-mini-card');
    roomMiniCards.forEach(card => {
        card.addEventListener('click', () => {
            // Remove active classes
            roomMiniCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');

            // Update active pagination bullet
            const index = Array.from(roomMiniCards).indexOf(card);
            const bullets = document.querySelectorAll('.pagination-bullet');
            bullets.forEach((bullet, idx) => {
                if (idx === index) {
                    bullet.classList.add('active');
                } else {
                    bullet.classList.remove('active');
                }
            });

            // Read variables
            selectedRoomVal = card.getAttribute('data-room-val');
            selectedRoomPrice = parseInt(card.getAttribute('data-room-price'));
            selectedRoomImage = card.getAttribute('data-room-image');
            selectedRoomCapacity = card.getAttribute('data-room-capacity');
            selectedRoomDesc = card.getAttribute('data-room-desc');

            // Update Inspector Details
            document.getElementById('inspectorImage').src = selectedRoomImage;
            document.getElementById('inspectorCapacity').innerText = selectedRoomCapacity;
            document.getElementById('inspectorTitle').innerText = selectedRoomVal;
            document.getElementById('inspectorPrice').innerText = `від ${selectedRoomPrice} грн / ніч`;
            document.getElementById('inspectorDesc').innerText = selectedRoomDesc;

            // Update Step 2 recap defaults
            document.getElementById('recapRoomImage').src = selectedRoomImage;
            document.getElementById('recapRoomTitle').innerText = selectedRoomVal;
            document.getElementById('recapRoomPrice').innerText = `${selectedRoomPrice} грн / ніч`;

            // Reset calendar values and dates selected on room change to prevent crossing bookings
            selectedCheckinVal = "";
            selectedCheckoutVal = "";
            setStep2ButtonsDisabled(true);
            dateRecapText.innerText = "Дати ще не обрано";

            // Update calendar with new room parameters
            updateInlineCalendar();
        });
    });

    let roomsScrollCache = null;

    function cacheRoomsScrollParams() {
        const list = document.querySelector('.rooms-mini-list');
        if (!list) return;

        // Ensure container is relative so offsets are local to it
        list.style.position = 'relative';

        const listWidth = list.clientWidth;
        const cards = list.querySelectorAll('.room-mini-card');
        const cardsData = Array.from(cards).map((card, idx) => {
            return {
                index: idx,
                offsetLeft: card.offsetLeft,
                offsetWidth: card.offsetWidth,
                cardElement: card
            };
        });

        roomsScrollCache = {
            listWidth,
            cards: cardsData
        };
    }

    // Recalculate layout metrics on resize if the modal is currently active
    window.addEventListener('resize', () => {
        const bookingModal = document.getElementById('bookingModal');
        if (bookingModal && bookingModal.classList.contains('active')) {
            cacheRoomsScrollParams();
        }
    });

    // Sync horizontal scroll with pagination bullets on mobile (using a cached, high-performance, layout-reflow-free lookup)
    const roomsMiniList = document.querySelector('.rooms-mini-list');
    if (roomsMiniList) {
        let isScrolling = false;
        let scrollTimeout = null;

        const updatePagination = () => {
            if (!roomsScrollCache) {
                cacheRoomsScrollParams();
                if (!roomsScrollCache) {
                    isScrolling = false;
                    return;
                }
            }

            const scrollLeft = roomsMiniList.scrollLeft;
            const containerWidth = roomsScrollCache.listWidth;
            const containerCenter = scrollLeft + containerWidth / 2;

            let closestIndex = 0;
            let minDistance = Infinity;

            roomsScrollCache.cards.forEach((card) => {
                const cardCenter = card.offsetLeft + card.offsetWidth / 2;
                const dist = Math.abs(cardCenter - containerCenter);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestIndex = card.index;
                }
            });

            // Update active pagination bullet on scroll peek
            const bullets = document.querySelectorAll('.pagination-bullet');
            bullets.forEach((bullet, idx) => {
                if (idx === closestIndex) {
                    bullet.classList.add('active');
                } else {
                    bullet.classList.remove('active');
                }
            });

            isScrolling = false;
        };

        roomsMiniList.addEventListener('scroll', () => {
            if (!isScrolling) {
                isScrolling = true;
                requestAnimationFrame(updatePagination);
            }

            // Debounce active card selection until scrolling completely settles down
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                if (roomsScrollCache) {
                    const scrollLeft = roomsMiniList.scrollLeft;
                    const containerWidth = roomsScrollCache.listWidth;
                    const containerCenter = scrollLeft + containerWidth / 2;

                    let closestIndex = 0;
                    let minDistance = Infinity;

                    roomsScrollCache.cards.forEach((card) => {
                        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
                        const dist = Math.abs(cardCenter - containerCenter);
                        if (dist < minDistance) {
                            minDistance = dist;
                            closestIndex = card.index;
                        }
                    });

                    // Auto-click/select the centered card to sync details
                    const targetCard = roomMiniCards[closestIndex];
                    if (targetCard && !targetCard.classList.contains('active')) {
                        targetCard.click();
                    }
                }
            }, 180); // Smooth debounce delay to avoid Flatpickr thrashing while swiping
        }, { passive: true });
    }

    // Allow clicking on pagination bullets to switch cards
    const paginationBullets = document.querySelectorAll('.pagination-bullet');
    paginationBullets.forEach(bullet => {
        bullet.addEventListener('click', () => {
            const index = parseInt(bullet.getAttribute('data-index'));
            if (roomMiniCards[index]) {
                roomMiniCards[index].click();
                // Smooth scroll to the clicked card in the horizontal container
                roomMiniCards[index].scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                    inline: 'center'
                });
            }
        });
    });

    // Step navigation actions
    const goToStep2 = () => {
        if (selectedCheckinVal && selectedCheckoutVal) {
            step1Panel.classList.remove('active');
            step2Panel.classList.add('active');
            indicatorStep1.classList.remove('active');
            indicatorStep2.classList.add('active');
            
            // Force scroll top for modal card to ensure form fields are visible on mobile
            const wizardContainer = document.querySelector('.booking-wizard-container');
            if (wizardContainer) wizardContainer.scrollTop = 0;
        }
    };

    if (btnGoToStep2) {
        btnGoToStep2.addEventListener('click', goToStep2);
    }

    if (btnBackToStep1) {
        btnBackToStep1.addEventListener('click', () => {
            step2Panel.classList.remove('active');
            step1Panel.classList.add('active');
            indicatorStep2.classList.remove('active');
            indicatorStep1.classList.add('active');
        });
    }

    // 4. Floating Contact Button
    const contactBtn = document.getElementById('contactBtn');
    const contactPopup = document.getElementById('contactPopup');
    
    if (contactBtn && contactPopup) {
        contactBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            contactPopup.classList.toggle('hidden');
        });

        // Close popup when clicking outside
        document.addEventListener('click', () => {
            contactPopup.classList.add('hidden');
        });

        contactPopup.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // 4.1 Mobile Hamburger Menu Toggle Logic
    const menuToggle = document.getElementById('menuToggle');
    const mobileNavDropdown = document.getElementById('mobileNavDropdown');
    
    if (menuToggle && mobileNavDropdown) {
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            menuToggle.classList.toggle('active');
            mobileNavDropdown.classList.toggle('active');
            if (header) header.classList.toggle('menu-open');
        });

        // Close menu when clicking a link
        mobileNavDropdown.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                menuToggle.classList.remove('active');
                mobileNavDropdown.classList.remove('active');
                if (header) header.classList.remove('menu-open');
            });
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!menuToggle.contains(e.target) && !mobileNavDropdown.contains(e.target)) {
                menuToggle.classList.remove('active');
                mobileNavDropdown.classList.remove('active');
                if (header) header.classList.remove('menu-open');
            }
        });
    }

    // 5. Advanced Scroll Effects
    const header = document.querySelector('.navbar');

    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;

        if (!header) return;

        // Skip shrinking on mobile viewports to prevent layout reflow / glitching
        if (window.innerWidth <= 768) {
            header.classList.remove('shrunk');
        } else {
            // Header shrinking (desktop height transition)
            if (currentScroll > 50) {
                header.classList.add('shrunk');
            } else {
                header.classList.remove('shrunk');
            }
        }

        // Header scrolled state (background black transition on both mobile & desktop)
        if (currentScroll > 20) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    // Improved Intersection Observer
    const revealElements = document.querySelectorAll('.reveal, .room-card, .service-card, .faq-item');
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                revealObserver.unobserve(entry.target); // Animate only once
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    revealElements.forEach(el => {
        el.classList.add('reveal'); // Ensure reveal class is present
        revealObserver.observe(el);
    });

    // 6. Magnetic Button Effect (Subtle)
    const buttons = document.querySelectorAll('.btn-primary, .btn-secondary, .contact-btn');
    buttons.forEach(btn => {
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            
            btn.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`;
        });
        
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'translate(0, 0)';
        });
    });
    // 7. Booking Modal Logic
    const bookingModal = document.getElementById('bookingModal');
    const openModalBtns = document.querySelectorAll('.open-booking, .open-booking-for-room');
    const closeModalBtn = document.getElementById('closeModal');
    const modalOverlay = document.querySelector('.modal-overlay');

    const openModal = (targetRoomName) => {
        bookingModal.classList.add('active');
        document.body.classList.add('modal-open');

        // Reset wizard steps to step 1
        if (step1Panel) step1Panel.classList.add('active');
        if (step2Panel) step2Panel.classList.remove('active');
        if (indicatorStep1) indicatorStep1.classList.add('active');
        if (indicatorStep2) indicatorStep2.classList.remove('active');

        // Always reset dates when opening the modal for pristine state
        selectedCheckinVal = "";
        selectedCheckoutVal = "";
        setStep2ButtonsDisabled(true);
        if (dateRecapText) dateRecapText.innerText = "Дати ще не обрано";

        const checkinInputPlaceholder = document.getElementById('checkinPlaceholder');
        const checkoutInputPlaceholder = document.getElementById('checkoutPlaceholder');
        if (checkinInputPlaceholder) {
            checkinInputPlaceholder.innerText = "22.05.2026";
            checkinInputPlaceholder.classList.add('is-placeholder');
        }
        if (checkoutInputPlaceholder) {
            checkoutInputPlaceholder.innerText = "28.05.2026";
            checkoutInputPlaceholder.classList.add('is-placeholder');
        }
        closeCalendar();

        const selectActiveRoom = () => {
            if (targetRoomName) {
                const cards = document.querySelectorAll('.room-mini-card');
                let foundCard = null;
                
                // Exact match check
                cards.forEach(card => {
                    const roomVal = card.getAttribute('data-room-val');
                    if (roomVal && roomVal.toLowerCase().trim() === targetRoomName.toLowerCase().trim()) {
                        foundCard = card;
                    }
                });

                // Fuzzy match check if exact match not found
                if (!foundCard) {
                    cards.forEach(card => {
                        const roomVal = card.getAttribute('data-room-val');
                        if (roomVal && (roomVal.toLowerCase().includes(targetRoomName.toLowerCase()) || targetRoomName.toLowerCase().includes(roomVal.toLowerCase()))) {
                            foundCard = card;
                        }
                    });
                }

                if (foundCard) {
                    foundCard.click();
                } else if (cards.length > 0) {
                    cards[0].click();
                }
            } else {
                // Simulated click on currently active mini card to guarantee inline Flatpickr rendering
                const activeCard = document.querySelector('.room-mini-card.active');
                if (activeCard) {
                    activeCard.click();
                } else {
                    const firstCard = document.querySelector('.room-mini-card');
                    if (firstCard) firstCard.click();
                }
            }
        };

        // Render immediately using cache
        selectActiveRoom();

        // Cache scroll parameters after DOM metrics render
        setTimeout(cacheRoomsScrollParams, 100);

        // Perform cloud sync in the background to fetch latest real-time dates
        syncWithCloud().then(() => {
            // Silently refresh calendar with new blocked ranges if any
            updateInlineCalendar();
        });
    };

    const closeModal = () => {
        bookingModal.classList.remove('active');
        document.body.classList.remove('modal-open');
    };

    openModalBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Get room name from data attribute
            const roomName = btn.getAttribute('data-room-name') || "";
            openModal(roomName);
        });
    });

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    if (modalOverlay) modalOverlay.addEventListener('click', closeModal);

    // Escape key to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (infoModal && infoModal.classList.contains('active')) {
                hideInfoPopup();
            } else {
                if (bookingModal && bookingModal.classList.contains('active')) {
                    closeModal();
                }
                if (imageModal && imageModal.classList.contains('active')) {
                    imageModal.classList.remove('active');
                    document.body.classList.remove('modal-open');
                }
            }
        }
    });

    // 7.5. Room Details & Photo Info Popups
    const infoModal = document.getElementById('infoModal');
    const closeInfoModal = document.getElementById('closeInfoModal');
    const closeInfoModalBtn = document.getElementById('closeInfoModalBtn');
    const infoModalTitle = document.getElementById('infoModalTitle');
    const infoModalText = document.getElementById('infoModalText');
    const infoModalIcon = document.getElementById('infoModalIcon');

    // Ultra-smooth customized cubic ease-out scroll animation for room photos carousel
    const animateScrollLeft = (element, target, duration = 650) => {
        const start = element.scrollLeft;
        const change = target - start;
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Cubic ease-out curve for premium luxury momentum
            const easeOutCubic = (t) => (--t) * t * t + 1;
            
            element.scrollLeft = start + change * easeOutCubic(progress);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    };

    const getRoomFolder = (roomName) => {
        const normalized = roomName.toLowerCase().trim();
        if (normalized.includes("двомісний") && !normalized.includes("бюджетний")) return "double";
        if (normalized.includes("бюджетний")) return "budget";
        if (normalized.includes("сімейний")) return "family";
        if (normalized.includes("апартаменти преміум") || normalized.includes("преміум")) return "premium";
        return "double";
    };

    const getRoomPhotos = (roomName) => {
        const folder = getRoomFolder(roomName);
        if (folder === "double") {
            return [
                "rooms/double/photo_2026-05-22_12-36-12.jpg",
                "rooms/double/photo_2026-05-22_12-36-14.jpg",
                "rooms/double/photo_2026-05-22_12-36-17.jpg",
                "rooms/double/photo_2026-05-22_12-36-18.jpg",
                "rooms/double/photo_2026-05-22_12-36-20.jpg",
                "rooms/double/photo_2026-05-22_12-36-21.jpg",
                "rooms/double/photo_2026-05-22_12-36-22.jpg",
                "rooms/double/photo_2026-05-22_12-36-24.jpg"
            ];
        } else if (folder === "family") {
            return [
                "rooms/family/IMG_2318.JPG",
                "rooms/family/IMG_2321.JPG",
                "rooms/family/IMG_2322.JPG",
                "rooms/family/IMG_2323.JPG",
                "rooms/family/IMG_2324.JPG",
                "rooms/family/IMG_2325.JPG",
                "rooms/family/IMG_2326.JPG",
                "rooms/family/IMG_2327.JPG",
                "rooms/family/IMG_2330.JPG",
                "rooms/family/IMG_2331.JPG"
            ];
        } else if (folder === "premium") {
            return [
                "rooms/premium/IMG_2339.JPG",
                "rooms/premium/IMG_2340.JPG",
                "rooms/premium/IMG_2341.JPG",
                "rooms/premium/IMG_2343.JPG",
                "rooms/premium/IMG_2345.JPG",
                "rooms/premium/IMG_2346.JPG",
                "rooms/premium/IMG_9116.PNG",
                "rooms/premium/IMG_9119.PNG"
            ];
        } else if (folder === "budget") {
            return [
                "rooms/budget/DSC08414 (2).JPG",
                "rooms/budget/DSC08417 (2).JPG",
                "rooms/budget/IMG_2333.JPG",
                "rooms/budget/IMG_2336.JPG",
                "rooms/budget/IMG_2337.JPG",
                "rooms/budget/IMG_2338.JPG"
            ];
        }
        return [];
    };

    const getRoomDetails = (roomName) => {
        const details = {
            "двомісний номер": "Вишуканий затишок для двох. Номер площею 22 м² обладнаний ортопедичним королівським ліжком (King Size), вишуканим текстилем, власною мармуровою ванною кімнатою, ультрачітким Smart-TV, швидкісним Wi-Fi, міні-баром та індивідуальною системою кондиціонування. Ідеальний баланс комфорту та приватності.",
            "бюджетний двомісний": "Компактний, але неймовірно затишний та функціональний номер площею 18 м². Обладнаний двоспальним ліжком з ортопедичним матрацом, власною душовою кімнатою, телевізором та всіма необхідними зручностями для комфортного перебування за вигідною ціною.",
            "бюджетний двомісний номер": "Компактний, але неймовірно затишний та функціональний номер площею 18 м². Обладнаний двоспальним ліжком з ортопедичним матрацом, власною душовою кімнатою, телевізором та всіма необхідними зручностями для комфортного перебування за вигідною ціною.",
            "сімейний": "Просторий та затишний номер для всієї родини площею 35 м². Обладнаний великим двоспальним ліжком та розкладним диваном преміум-класу. До ваших послуг власна ванна кімната, Smart-TV, швидкісний інтернет, кондиціонер та чудовий вид на мальовничу природу Східниці.",
            "сімейний номер": "Просторий та затишний номер для всієї родини площею 35 м². Обладнаний великим двоспальним ліжком та розкладним диваном преміум-класу. До ваших послуг власна ванна кімната, Smart-TV, швидкісний інтернет, кондиціонер та чудовий вид на мальовничу природу Східниці.",
            "апартаменти преміум": "Розкішні апартаменти площею 45 м² для справжніх цінувальників преміального комфорту. Номер обладнаний сучасним ліжком King Size, повністю укомплектованою власною кухнею та вітальною зоною. Має дизайнерський інтер'єр, вишукану ванну кімнату та панорамну терасу."
        };
        const normalized = roomName.toLowerCase().trim();
        return details[normalized] || "Розкішний номер із бездоганним дизайнерським інтер'єром, обладнаний сучасними зручностями: ортопедичне ліжко King Size, вишукана ванна кімната, Smart-TV, кондиціонер, швидкісний інтернет та міні-бар. Повні деталі та характеристики будуть опубліковані найближчим часом.";
    };

    const showInfoPopup = async (type, roomName) => {
        if (!infoModal) return;
        const displayRoomName = roomName || "номер";
        const modalContent = infoModal.querySelector('.info-modal-content');
        const galleryGrid = document.getElementById('infoModalGallery');
        const track = galleryGrid ? galleryGrid.querySelector('.gallery-carousel-track') : null;
        const dotsContainer = galleryGrid ? galleryGrid.querySelector('#galleryDots') : null;
        const prevBtn = galleryGrid ? galleryGrid.querySelector('#galleryPrevBtn') : null;
        const nextBtn = galleryGrid ? galleryGrid.querySelector('#galleryNextBtn') : null;
        
        // Reset states
        if (modalContent) modalContent.classList.remove('is-gallery');
        if (infoModalIcon) infoModalIcon.classList.remove('hidden');
        if (infoModalText) infoModalText.classList.remove('hidden');
        if (galleryGrid) {
            galleryGrid.classList.add('hidden');
            if (track) track.innerHTML = '';
            if (dotsContainer) dotsContainer.innerHTML = '';
        }
        
        const closeBtnBottom = document.getElementById('closeInfoModalBtn');
        if (closeBtnBottom) closeBtnBottom.classList.remove('hidden');

        if (type === 'photos') {
            if (modalContent) modalContent.classList.add('is-gallery');
            if (infoModalIcon) infoModalIcon.classList.add('hidden');
            if (infoModalText) infoModalText.classList.add('hidden');
            if (closeBtnBottom) closeBtnBottom.classList.add('hidden');

            if (infoModalTitle) infoModalTitle.innerText = `Фотогалерея: ${displayRoomName}`;
            
            if (galleryGrid && track) {
                galleryGrid.classList.remove('hidden');
                const photos = getRoomPhotos(displayRoomName);
                if (photos.length > 0) {
                    photos.forEach(photoSrc => {
                        const item = document.createElement('div');
                        item.className = 'gallery-item';
                        item.innerHTML = `<img src="${photoSrc}" alt="${displayRoomName}" loading="eager" style="cursor: zoom-in;">`;
                        track.appendChild(item);
                    });

                    // Build indicators (dots) dynamically
                    if (dotsContainer) {
                        dotsContainer.innerHTML = '';
                        photos.forEach((_, idx) => {
                            const dot = document.createElement('button');
                            dot.type = 'button';
                            dot.className = `carousel-dot ${idx === 0 ? 'active' : ''}`;
                            dot.setAttribute('aria-label', `Перейти до фото ${idx + 1}`);
                            dot.addEventListener('click', () => {
                                const slideWidth = track.firstElementChild ? track.firstElementChild.getBoundingClientRect().width : track.clientWidth;
                                animateScrollLeft(track, idx * slideWidth, 650);
                            });
                            dotsContainer.appendChild(dot);
                        });
                    }

                    // Show or hide controls based on count
                    const showControls = photos.length > 1;
                    if (prevBtn) prevBtn.style.display = showControls ? 'flex' : 'none';
                    if (nextBtn) nextBtn.style.display = showControls ? 'flex' : 'none';
                    if (dotsContainer) dotsContainer.style.display = showControls ? 'flex' : 'none';

                    // Reset track position to index 0
                    track.scrollLeft = 0;
                } else {
                    track.innerHTML = `<p style="color: var(--clr-charcoal); text-align: center; width: 100%; margin: 2rem 0;">Не знайдено фотографій для цього номера.</p>`;
                    if (prevBtn) prevBtn.style.display = 'none';
                    if (nextBtn) nextBtn.style.display = 'none';
                    if (dotsContainer) dotsContainer.style.display = 'none';
                }
            }
        } else if (type === 'details') {
            if (infoModalIcon) {
                infoModalIcon.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="stroke: var(--clr-gold); width: 42px; height: 42px;">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                `;
            }
            if (infoModalTitle) infoModalTitle.innerText = `Деталі: ${displayRoomName}`;
            
            if (infoModalText) {
                infoModalText.innerText = "Завантаження опису...";
                const folder = getRoomFolder(displayRoomName);
                try {
                    const res = await fetch(`/rooms/${folder}/${encodeURIComponent("Опис номеру.txt")}`);
                    if (res.ok) {
                        const text = await res.text();
                        if (text && text.trim().length > 0) {
                            infoModalText.innerText = text.trim();
                        } else {
                            infoModalText.innerText = getRoomDetails(displayRoomName);
                        }
                    } else {
                        infoModalText.innerText = getRoomDetails(displayRoomName);
                    }
                } catch (e) {
                    infoModalText.innerText = getRoomDetails(displayRoomName);
                }
            }
        }
        
        infoModal.classList.add('active');
        document.body.classList.add('modal-open');
    };

    const hideInfoPopup = () => {
        if (!infoModal) return;
        infoModal.classList.remove('active');
        const modalContent = infoModal.querySelector('.info-modal-content');
        if (modalContent) modalContent.classList.remove('is-gallery');
        if (bookingModal && !bookingModal.classList.contains('active')) {
            document.body.classList.remove('modal-open');
        }
    };

    // 7.2 Show More / Less Rooms Catalogs
    const showMoreRoomsBtn = document.getElementById('showMoreRooms');
    const extraRoomsGrid = document.getElementById('extraRooms');
    if (showMoreRoomsBtn && extraRoomsGrid) {
        showMoreRoomsBtn.addEventListener('click', () => {
            const isHidden = extraRoomsGrid.style.display === 'none';
            if (isHidden) {
                extraRoomsGrid.style.display = 'grid';
                showMoreRoomsBtn.innerText = 'Побачити менше';
                const cards = extraRoomsGrid.querySelectorAll('.room-card');
                cards.forEach(card => {
                    card.classList.add('active');
                });
            } else {
                extraRoomsGrid.style.display = 'none';
                showMoreRoomsBtn.innerText = 'Побачити більше';
                const roomsSection = document.getElementById('rooms');
                if (roomsSection) {
                    roomsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });
    }

    // Listeners for main page room cards (Direct full-screen Lightbox)
    document.querySelectorAll('.room-card .btn-room-photos').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const roomName = btn.getAttribute('data-room-name') || "";
            const photos = getRoomPhotos(roomName);
            openLightbox(photos, 0);
        });
    });

    document.querySelectorAll('.room-card .btn-room-details').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const roomName = btn.getAttribute('data-room-name') || "";
            showInfoPopup('details', roomName);
        });
    });

    // Listeners for booking wizard inspector panel (Direct full-screen Lightbox)
    const inspectorBtnPhotos = document.getElementById('inspectorBtnPhotos');
    if (inspectorBtnPhotos) {
        inspectorBtnPhotos.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const activeRoomName = document.getElementById('inspectorTitle') ? document.getElementById('inspectorTitle').innerText.trim() : "";
            const photos = getRoomPhotos(activeRoomName);
            openLightbox(photos, 0);
        });
    }

    const inspectorBtnDetails = document.getElementById('inspectorBtnDetails');
    if (inspectorBtnDetails) {
        inspectorBtnDetails.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const activeRoomName = document.getElementById('inspectorTitle') ? document.getElementById('inspectorTitle').innerText.trim() : "";
            showInfoPopup('details', activeRoomName);
        });
    }

    if (closeInfoModal) closeInfoModal.addEventListener('click', hideInfoPopup);
    if (closeInfoModalBtn) closeInfoModalBtn.addEventListener('click', hideInfoPopup);
    if (infoModal) {
        infoModal.addEventListener('click', (e) => {
            if (e.target === infoModal) {
                hideInfoPopup();
            }
        });
    }

    // Carousel navigation button and scroll listeners
    const galleryTrack = document.querySelector('.gallery-carousel-track');
    const galleryPrevBtn = document.getElementById('galleryPrevBtn');
    const galleryNextBtn = document.getElementById('galleryNextBtn');
    const galleryDotsContainer = document.getElementById('galleryDots');

    if (galleryPrevBtn && galleryNextBtn && galleryTrack) {
        galleryPrevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const slideWidth = galleryTrack.firstElementChild ? galleryTrack.firstElementChild.getBoundingClientRect().width : galleryTrack.clientWidth;
            const targetScroll = Math.max(0, galleryTrack.scrollLeft - slideWidth);
            animateScrollLeft(galleryTrack, targetScroll, 650);
        });

        galleryNextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const slideWidth = galleryTrack.firstElementChild ? galleryTrack.firstElementChild.getBoundingClientRect().width : galleryTrack.clientWidth;
            const maxScroll = galleryTrack.scrollWidth - galleryTrack.clientWidth;
            const targetScroll = Math.min(maxScroll, galleryTrack.scrollLeft + slideWidth);
            animateScrollLeft(galleryTrack, targetScroll, 650);
        });

        galleryTrack.addEventListener('scroll', () => {
            if (!galleryDotsContainer) return;
            const index = Math.round(galleryTrack.scrollLeft / galleryTrack.clientWidth);
            const dots = galleryDotsContainer.querySelectorAll('.carousel-dot');
            dots.forEach((dot, idx) => {
                dot.classList.toggle('active', idx === index);
            });
        });
    }

    // Eager preloader helper for photos
    const preloadImage = (src) => {
        const img = new Image();
        img.src = src;
    };

    // Preload room photos on card hover for instant opening
    document.querySelectorAll('.room-card').forEach(card => {
        card.addEventListener('mouseenter', () => {
            const btn = card.querySelector('.btn-room-photos');
            if (btn) {
                const roomName = btn.getAttribute('data-room-name') || "";
                const photos = getRoomPhotos(roomName);
                photos.forEach(photoSrc => {
                    preloadImage(photoSrc);
                });
            }
        }, { once: true }); // Only run once per card hover to save bandwidth
    });
    // 8. Image Lightbox Logic
    const imageModal = document.getElementById('imageModal');
    const lightboxImage = document.getElementById('lightboxImage');
    const closeImageModalBtn = document.getElementById('closeImageModal');
    const lightboxPrevBtn = document.getElementById('lightboxPrevBtn');
    const lightboxNextBtn = document.getElementById('lightboxNextBtn');

    // Style zoom-in cursor initially
    document.querySelectorAll('.carousel-item img, .triple-card img, .split-image img, .inspector-image-wrap img, .room-mini-card img, .recap-room-card img, .room-card-image-wrap img, .gallery-item img').forEach(img => {
        img.style.cursor = 'zoom-in';
    });

    let lightboxImages = [];
    let lightboxCurrentIndex = 0;

    const updateLightboxImage = () => {
        if (!lightboxImage || lightboxImages.length === 0) return;
        
        // Fading micro-animation
        lightboxImage.style.opacity = 0;
        setTimeout(() => {
            lightboxImage.src = lightboxImages[lightboxCurrentIndex];
            lightboxImage.style.opacity = 1;
        }, 120);

        // Update active dots and text badge
        const indicatorText = document.getElementById('lightboxIndicator');
        const total = lightboxImages.length;
        const currentOneBased = lightboxCurrentIndex + 1;

        if (indicatorText) {
            indicatorText.innerText = `${currentOneBased} / ${total}`;
        }

        // Handle luxury dots indicators that expand when active
        const dotsContainer = document.getElementById('lightboxDots');
        if (dotsContainer) {
            // Rebuild dots if count is different or empty
            if (dotsContainer.children.length !== total) {
                dotsContainer.innerHTML = '';
                for (let i = 0; i < total; i++) {
                    const dot = document.createElement('span');
                    dot.className = `lightbox-dot ${i === lightboxCurrentIndex ? 'active' : ''}`;
                    dot.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        lightboxCurrentIndex = i;
                        updateLightboxImage();
                    });
                    dotsContainer.appendChild(dot);
                }
            } else {
                // Just update the active class on existing dots
                Array.from(dotsContainer.children).forEach((dot, i) => {
                    if (i === lightboxCurrentIndex) {
                        dot.classList.add('active');
                    } else {
                        dot.classList.remove('active');
                    }
                });
            }
            // Hide the dots container entirely if there is only 1 photo
            dotsContainer.style.display = total > 1 ? 'flex' : 'none';
        }

        // Hide navigation arrows if there is only 1 image
        if (lightboxPrevBtn && lightboxNextBtn) {
            const showCtrls = total > 1;
            lightboxPrevBtn.style.display = showCtrls ? 'flex' : 'none';
            lightboxNextBtn.style.display = showCtrls ? 'flex' : 'none';
        }
    };

    const openLightbox = (images, startIndex = 0) => {
        if (!images || images.length === 0) return;
        lightboxImages = images;
        lightboxCurrentIndex = startIndex;
        if (lightboxImage && imageModal) {
            updateLightboxImage();
            imageModal.classList.add('active');
            document.body.classList.add('modal-open');
        }
    };

    const lightboxNext = () => {
        if (lightboxImages.length <= 1) return;
        lightboxCurrentIndex = (lightboxCurrentIndex + 1) % lightboxImages.length;
        updateLightboxImage();
    };

    const lightboxPrev = () => {
        if (lightboxImages.length <= 1) return;
        lightboxCurrentIndex = (lightboxCurrentIndex - 1 + lightboxImages.length) % lightboxImages.length;
        updateLightboxImage();
    };

    if (lightboxPrevBtn) {
        lightboxPrevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            lightboxPrev();
        });
    }

    if (lightboxNextBtn) {
        lightboxNextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            lightboxNext();
        });
    }

    // Delegate click event globally to support dynamic and cloned carousel elements!
    document.addEventListener('click', (e) => {
        const targetImg = e.target;
        if (targetImg && targetImg.tagName === 'IMG') {
            // Check if it's inside one of our allowed gallery containers
            const container = targetImg.closest('.photo-carousel') ||
                              targetImg.closest('.gallery-carousel-track') || 
                              targetImg.closest('.carousel-track') || 
                              targetImg.closest('.room-card-image-wrap') ||
                              targetImg.closest('.triple-card') || 
                              targetImg.closest('.split-image') ||
                              targetImg.closest('.inspector-image-wrap');
                              
            if (container) {
                let imgs = Array.from(container.querySelectorAll('img'));
                // Filter out infinite scroll cloned items to prevent duplicating entries in Lightbox
                if (container.closest('.photo-carousel') || container.classList.contains('photo-carousel')) {
                    imgs = imgs.filter(img => !img.closest('.is-clone'));
                }
                
                if (imgs.length > 0) {
                    lightboxImages = imgs.map(img => img.src);
                    // Match by source URL to support cloned DOM elements perfectly
                    lightboxCurrentIndex = lightboxImages.indexOf(targetImg.src);
                    if (lightboxCurrentIndex === -1) lightboxCurrentIndex = 0;
                    
                    if (lightboxImage && imageModal) {
                        updateLightboxImage();
                        imageModal.classList.add('active');
                        document.body.classList.add('modal-open');
                    }
                    return;
                }
            }

            // Isolated/Fallback elements
            if (targetImg.closest('.carousel-item') || 
                targetImg.closest('.room-mini-card') || 
                targetImg.closest('.recap-room-card') || 
                targetImg.closest('.gallery-item')) {
                
                lightboxImages = [targetImg.src];
                lightboxCurrentIndex = 0;
                if (lightboxImage && imageModal) {
                    updateLightboxImage();
                    imageModal.classList.add('active');
                    document.body.classList.add('modal-open');
                }
            }
        }
    });

    if (closeImageModalBtn) {
        closeImageModalBtn.addEventListener('click', () => {
            imageModal.classList.remove('active');
            document.body.classList.remove('modal-open');
        });
    }

    if (imageModal) {
        imageModal.querySelector('.modal-overlay').addEventListener('click', () => {
            imageModal.classList.remove('active');
            document.body.classList.remove('modal-open');
        });
        
        // Touch Swiping logic for mobile
        let touchStartX = 0;
        let touchEndX = 0;
        
        imageModal.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });
        
        imageModal.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            const deltaX = touchEndX - touchStartX;
            if (Math.abs(deltaX) > 50) {
                if (deltaX < 0) {
                    lightboxNext(); // swipe left
                } else {
                    lightboxPrev(); // swipe right
                }
            }
        }, { passive: true });
    }

    // Keyboard controls for Lightbox
    document.addEventListener('keydown', (e) => {
        if (imageModal && imageModal.classList.contains('active')) {
            if (e.key === 'ArrowRight') {
                lightboxNext();
            } else if (e.key === 'ArrowLeft') {
                lightboxPrev();
            } else if (e.key === 'Escape') {
                imageModal.classList.remove('active');
                document.body.classList.remove('modal-open');
            }
        }
    });
    // 9. Advanced Scroll Fade Effect (Fade out when leaving viewport)
    const animatedElements = document.querySelectorAll('.reveal, .room-card, .service-card, .split-content, .split-image');
    
    const handleScrollAnimations = () => {
        if (window.innerWidth <= 768) {
            // Disable heavy scroll-fade animations on mobile to prevent performance lag and layout glitches
            animatedElements.forEach(el => {
                el.style.opacity = '';
                el.style.transform = '';
            });
            return;
        }
        const viewportHeight = window.innerHeight;
        const fadeThreshold = 200; // Distance from top/bottom to start fading

        animatedElements.forEach(el => {
            const rect = el.getBoundingClientRect();
            const elementCenter = rect.top + rect.height / 2;
            
            // Calculate distance from viewport edges
            const distFromTop = rect.bottom;
            const distFromBottom = viewportHeight - rect.top;

            let opacity = 1;

            if (distFromTop < fadeThreshold) {
                // Fading out at the top
                opacity = Math.max(0, distFromTop / fadeThreshold);
            } else if (distFromBottom < fadeThreshold) {
                // Fading out at the bottom
                opacity = Math.max(0, distFromBottom / fadeThreshold);
            }

            // Apply opacity and a subtle scale/shift
            el.style.opacity = opacity;
            const scale = 0.95 + (opacity * 0.05);
            const translate = (1 - opacity) * 20; // Move slightly away
            
            // Only apply if it's already "revealed" or has a base opacity
            if (el.classList.contains('active') || !el.classList.contains('reveal')) {
                el.style.transform = `scale(${scale}) translateY(${rect.top < 0 ? -translate : translate}px)`;
            }
        });
    };

    window.addEventListener('scroll', () => {
        requestAnimationFrame(handleScrollAnimations);
    });

    // 9.1 Side Decorations Observer
    const decoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            } else {
                entry.target.classList.remove('active');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.side-decorated').forEach(section => {
        decoObserver.observe(section);
    });

    // 10. Hero Background Slideshow
    const slides = document.querySelectorAll('.hero-slides img');
    let currentSlide = 0;

    const nextSlide = () => {
        slides[currentSlide].classList.remove('active');
        currentSlide = (currentSlide + 1) % slides.length;
        slides[currentSlide].classList.add('active');
    };

    if (slides.length > 1) {
        setInterval(nextSlide, 4000); // Change every 4 seconds
    }



    // ==========================================
    // CAROUSEL LOGIC (Infinite Loop Redesign!)
    // ==========================================
    const carousel = document.getElementById('photoCarousel');
    if (carousel) {
        const originalItems = Array.from(carousel.querySelectorAll('.carousel-item'));
        const originalCount = originalItems.length;

        if (originalCount > 0) {
            // 1. Dynamic Cloning to make it infinite
            // Clone all items and append them to the end
            originalItems.forEach(item => {
                const clone = item.cloneNode(true);
                clone.classList.add('is-clone');
                carousel.appendChild(clone);
            });

            // Clone all items and prepend them to the start (maintaining correct order)
            originalItems.slice().reverse().forEach(item => {
                const clone = item.cloneNode(true);
                clone.classList.add('is-clone');
                carousel.insertBefore(clone, carousel.firstChild);
            });

            // Retrieve updated list of items including all clones
            const cItems = carousel.querySelectorAll('.carousel-item');
            const prevBtn = document.querySelector('.prev-btn');
            const nextBtn = document.querySelector('.next-btn');

            // Helper to get real responsive item widths and gap settings
            const getMetrics = () => {
                const itemWidth = originalItems[0].offsetWidth || 640;
                const gap = parseInt(window.getComputedStyle(carousel).gap || 24);
                const stepWidth = itemWidth + gap;
                const totalOriginalWidth = stepWidth * originalCount;
                return { stepWidth, totalOriginalWidth };
            };

            // Set initial position (center group of original slides)
            const initPosition = () => {
                const { totalOriginalWidth } = getMetrics();
                carousel.style.scrollBehavior = 'auto';
                carousel.style.scrollSnapType = 'none';
                carousel.scrollLeft = totalOriginalWidth;
                carousel.offsetHeight; // force layout reflow
                carousel.style.scrollBehavior = '';
                carousel.style.scrollSnapType = '';
            };

            // Calculate and assign active and adjacent classes for elite focus/blur animations
            const updateActiveItem = () => {
                const carouselCenter = carousel.getBoundingClientRect().left + carousel.offsetWidth / 2;
                let closestIndex = 0;
                let minDistance = Infinity;

                cItems.forEach((item, index) => {
                    const rect = item.getBoundingClientRect();
                    const itemCenter = rect.left + rect.width / 2;
                    const distance = Math.abs(carouselCenter - itemCenter);
                    
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestIndex = index;
                    }
                });

                cItems.forEach((item, index) => {
                    item.classList.remove('is-active', 'is-adjacent');
                    if (index === closestIndex) {
                        item.classList.add('is-active');
                    } else if (index === closestIndex - 1 || index === closestIndex + 1) {
                        item.classList.add('is-adjacent');
                    }
                });
            };

            // Infinite loop-around boundary checker
            const handleInfiniteScroll = () => {
                const { totalOriginalWidth } = getMetrics();
                
                // If scrolled too close to the start (into prepended clones)
                if (carousel.scrollLeft < totalOriginalWidth * 0.5) {
                    carousel.style.scrollBehavior = 'auto';
                    carousel.style.scrollSnapType = 'none';
                    carousel.scrollLeft += totalOriginalWidth;
                    carousel.offsetHeight; // force layout reflow
                    carousel.style.scrollBehavior = '';
                    carousel.style.scrollSnapType = '';
                }
                // If scrolled too close to the end (into appended clones)
                else if (carousel.scrollLeft >= totalOriginalWidth * 1.5) {
                    carousel.style.scrollBehavior = 'auto';
                    carousel.style.scrollSnapType = 'none';
                    carousel.scrollLeft -= totalOriginalWidth;
                    carousel.offsetHeight; // force layout reflow
                    carousel.style.scrollBehavior = '';
                    carousel.style.scrollSnapType = '';
                }
                
                updateActiveItem();
            };

            // Run check on scroll
            carousel.addEventListener('scroll', handleInfiniteScroll);

            // Double delay initial positioning for robust layout rendering
            setTimeout(() => {
                initPosition();
                updateActiveItem();
            }, 50);

            window.addEventListener('load', () => {
                initPosition();
                updateActiveItem();
            });

            // Navigation Buttons
            if (prevBtn && nextBtn) {
                prevBtn.addEventListener('click', () => {
                    const { stepWidth } = getMetrics();
                    carousel.scrollBy({ left: -stepWidth, behavior: 'smooth' });
                });
                nextBtn.addEventListener('click', () => {
                    const { stepWidth } = getMetrics();
                    carousel.scrollBy({ left: stepWidth, behavior: 'smooth' });
                });
            }

            // Mouse Drag to Scroll
            let isDown = false;
            let startX;
            let scrollLeft;

            carousel.addEventListener('mousedown', (e) => {
                isDown = true;
                carousel.classList.add('dragging');
                startX = e.pageX - carousel.offsetLeft;
                scrollLeft = carousel.scrollLeft;
            });
            
            carousel.addEventListener('mouseleave', () => {
                isDown = false;
                carousel.classList.remove('dragging');
            });
            
            carousel.addEventListener('mouseup', () => {
                isDown = false;
                carousel.classList.remove('dragging');
            });
            
            carousel.addEventListener('mousemove', (e) => {
                if (!isDown) return;
                e.preventDefault();
                const x = e.pageX - carousel.offsetLeft;
                const walk = (x - startX) * 2.5; // Drag scroll rate
                carousel.scrollLeft = scrollLeft - walk;
            });

            // Handle window resizing
            window.addEventListener('resize', () => {
                const { totalOriginalWidth } = getMetrics();
                if (carousel.scrollLeft < totalOriginalWidth * 0.5 || carousel.scrollLeft >= totalOriginalWidth * 1.5) {
                    carousel.scrollLeft = totalOriginalWidth;
                }
            });
        }
    }

    // Initial check
    handleScrollAnimations();

    // Background cache warming sync on page load
    syncWithCloud();
});
