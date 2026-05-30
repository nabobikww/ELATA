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
                
                const now = new Date();
                const kyivParts = new Intl.DateTimeFormat('uk-UA', {
                    timeZone: 'Europe/Kyiv',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                }).formatToParts(now);

                const getPart = (type) => kyivParts.find(p => p.type === type).value;
                const exactTime = `${getPart('day')}.${getPart('month')}.${getPart('year')} ${getPart('hour')}:${getPart('minute')}`;

                // Створюємо об'єкт бронювання
                const newBooking = {
                    id: newId,
                    name: name,
                    phone: phone,
                    room: `${room} (${guestsCombined})`,
                    dates: formattedDates,
                    status: 'Нове',
                    createdAt: exactTime,
                    comment: `Бронювання з головної сторінки. Сума: ${document.getElementById('recapTotalPrice')?.innerText || '0 грн'}`
                };

                // Атомарно додаємо нове бронювання в хмару (pushToCloud оновить і локальний кеш)
                await pushToCloud(newBooking);

                // Закриваємо модалку бронювання
                closeModal();

                // Відображаємо Success Modal з динамічним ID та посиланням на Telegram
                const successModal = document.getElementById('successModal');
                const successBookingId = document.getElementById('successBookingId');
                const successTelegramBtn = document.getElementById('successTelegramBtn');

                if (successBookingId) successBookingId.innerText = `#${newId}`;
                if (successTelegramBtn) successTelegramBtn.href = `https://t.me/ElataAbot?start=${newId}`;
                if (successModal) successModal.classList.add('active');

                bookingForm.reset();
                
                // Скидаємо календар
                if (fpInline) {
                    fpInline.clear();
                }
                selectedCheckinVal = "";
                selectedCheckoutVal = "";
                btnGoToStep2.disabled = true;
                dateRecapText.innerText = "Дати ще не обрано";
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
    let selectedRoomPrice = 2800;
    let selectedRoomImage = "DSC08330.webp";
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

    function calculatePrices() {
        const adultsVal = document.getElementById('bookingAdults')?.value || "2";
        const childrenVal = document.getElementById('bookingChildren')?.value || "0";
        
        let adults = 2;
        if (adultsVal === "more_adults") adults = 5;
        else adults = parseInt(adultsVal) || 2;
        
        let children = 0;
        if (childrenVal === "more_children") children = 4;
        else children = parseInt(childrenVal) || 0;
        
        const totalGuests = adults + children;
        
        const errorDiv = document.getElementById('guestCapacityError');
        const submitBtn = document.querySelector('#bookingStep2 .btn-submit');
        
        if (totalGuests > 4) {
            if (errorDiv) errorDiv.style.display = 'block';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.style.opacity = '0.5';
                submitBtn.style.pointerEvents = 'none';
            }
            const recapTotalPrice = document.getElementById('recapTotalPrice');
            if (recapTotalPrice) {
                recapTotalPrice.innerText = 'Завелика кількість осіб';
            }
            return;
        } else {
            if (errorDiv) errorDiv.style.display = 'none';
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
                submitBtn.style.pointerEvents = 'auto';
            }
        }
        
        let multiplier = 1.0;
        if (totalGuests === 1) {
            multiplier = 0.90;
        } else if (totalGuests === 3) {
            multiplier = 1.15;
        } else if (totalGuests >= 4) {
            multiplier = 1.20;
        }
        
        // Calculate nights
        let diffDays = 0;
        if (selectedCheckinVal && selectedCheckoutVal) {
            const start = new Date(selectedCheckinVal);
            const end = new Date(selectedCheckoutVal);
            const diffTime = Math.abs(end - start);
            diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }
        
        let daysDiscount = 1.0;
        if (diffDays >= 3) {
            daysDiscount = 0.95;
        }

        const finalNightlyPrice = Math.round(selectedRoomPrice * multiplier * daysDiscount);
        const total = diffDays * finalNightlyPrice;
        
        // Update Step 2 recap UI
        const recapRoomPrice = document.getElementById('recapRoomPrice');
        if (recapRoomPrice) {
            recapRoomPrice.innerText = `${finalNightlyPrice.toLocaleString()} грн / ніч`;
        }
        
        const recapTotalPrice = document.getElementById('recapTotalPrice');
        if (recapTotalPrice) {
            if (diffDays > 0) {
                recapTotalPrice.innerText = `${total.toLocaleString()} грн`;
            } else {
                recapTotalPrice.innerText = `0 грн`;
            }
        }
    }

    const bookingAdultsSelect = document.getElementById('bookingAdults');
    const bookingChildrenSelect = document.getElementById('bookingChildren');
    if (bookingAdultsSelect) {
        bookingAdultsSelect.addEventListener('change', calculatePrices);
    }
    if (bookingChildrenSelect) {
        bookingChildrenSelect.addEventListener('change', calculatePrices);
    }

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
                    calculatePrices();
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
            calculatePrices();

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

            calculatePrices();
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

    // Success Modal closing logic
    const successModalEl = document.getElementById('successModal');
    const closeSuccessModalBtn = document.getElementById('closeSuccessModal');
    const successModalOverlay = document.querySelector('#successModal .modal-overlay');

    const closeSuccessModal = () => {
        if (successModalEl) successModalEl.classList.remove('active');
    };

    if (closeSuccessModalBtn) closeSuccessModalBtn.addEventListener('click', closeSuccessModal);
    if (successModalOverlay) successModalOverlay.addEventListener('click', closeSuccessModal);

    // Escape key to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (infoModal && infoModal.classList.contains('active')) {
                hideInfoPopup();
            } else {
                if (bookingModal && bookingModal.classList.contains('active')) {
                    closeModal();
                }
                if (successModalEl && successModalEl.classList.contains('active')) {
                    closeSuccessModal();
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
        if (normalized.includes("двокімнатний делюкс") || normalized.includes("делюкс")) return "deluxe";
        if (normalized.includes("двокімнатний преміум")) return "two-room-premium";
        if (normalized.includes("апартаменти преміум") || normalized.includes("преміум")) return "premium";
        return "double";
    };

    const getRoomPhotos = (roomName) => {
        const folder = getRoomFolder(roomName);
        if (folder === "double") {
            return [
                "rooms/double/photo_2026-05-22_12-36-12.webp",
                "rooms/double/photo_2026-05-22_12-36-14.webp",
                "rooms/double/photo_2026-05-22_12-36-17.webp",
                "rooms/double/photo_2026-05-22_12-36-18.webp",
                "rooms/double/photo_2026-05-22_12-36-20.webp",
                "rooms/double/photo_2026-05-22_12-36-21.webp",
                "rooms/double/photo_2026-05-22_12-36-22.webp",
                "rooms/double/photo_2026-05-22_12-36-24.webp"
            ];
        } else if (folder === "family") {
            return [
                "rooms/family/IMG_2318.webp",
                "rooms/family/IMG_2321.webp",
                "rooms/family/IMG_2322.webp",
                "rooms/family/IMG_2323.webp",
                "rooms/family/IMG_2324.webp",
                "rooms/family/IMG_2325.webp",
                "rooms/family/IMG_2326.webp",
                "rooms/family/IMG_2327.webp",
                "rooms/family/IMG_2330.webp",
                "rooms/family/IMG_2331.webp"
            ];
        } else if (folder === "premium") {
            return [
                "rooms/premium/IMG_2339.webp",
                "rooms/premium/IMG_2340.webp",
                "rooms/premium/IMG_2341.webp",
                "rooms/premium/IMG_2343.webp",
                "rooms/premium/IMG_2345.webp",
                "rooms/premium/IMG_2346.webp"
            ];
        } else if (folder === "budget") {
            return [
                "rooms/budget/IMG_2333.webp",
                "rooms/budget/IMG_2336.webp",
                "rooms/budget/IMG_2337.webp",
                "rooms/budget/IMG_2338.webp",
                "rooms/budget/DSC08414 (2).webp",
                "rooms/budget/DSC08417 (2).webp"
            ];
        } else if (folder === "deluxe") {
            return [
                "rooms/deluxe/IMG_2356.webp",
                "rooms/deluxe/IMG_2357.webp",
                "rooms/deluxe/IMG_2358.webp",
                "rooms/deluxe/IMG_2359.webp",
                "rooms/deluxe/IMG_2360.webp",
                "rooms/deluxe/IMG_2363.webp",
                "rooms/deluxe/IMG_2354.webp",
                "rooms/deluxe/IMG_2355.webp"
            ];
        } else if (folder === "two-room-premium") {
            return [
                "rooms/two-room-premium/IMG_9227.webp",
                "rooms/two-room-premium/IMG_2374.webp",
                "rooms/two-room-premium/IMG_2365.webp",
                "rooms/two-room-premium/IMG_2366.webp",
                "rooms/two-room-premium/IMG_2367.webp",
                "rooms/two-room-premium/IMG_2368.webp",
                "rooms/two-room-premium/IMG_2369.webp",
                "rooms/two-room-premium/IMG_2370.webp",
                "rooms/two-room-premium/IMG_2371.webp",
                "rooms/two-room-premium/IMG_2372.webp",
                "rooms/two-room-premium/IMG_2373.webp",
                "rooms/two-room-premium/IMG_2376.webp"
            ];
        }
        return [];
    };

    const getRoomDetails = (roomName) => {
        const details = {
            "двомісний номер": "📐 Простір та планування\n• Площа: 17 квадратних метрів.\n• Планування: компактний та комфортний номер для двох гостей.\n• Вулична зона: власний балкон для відпочинку.\n\n🛏️ Спальні місця\n• Основне: одне велике двоспальне ліжко.\n\n🛁 Зручності та сервіс\n• Санвузол: власна ванна кімната в номері.\n• Гігієна: безкоштовні туалетно-косметичні засоби.\n• Зберігання: шафа або гардероб для речей.\n• Зв'язок: безкоштовний бездротовий інтернет (Wi-Fi).\n• Техніка: телевізор із плоским екраном та холодильник.\n\n⛰️ Головні переваги\n• Краєвид: мальовничий вид на гори.\n• Комфорт: затишний номер із усіма базовими зручностями для відпочинку.",
            "двомісний": "📐 Простір та планування\n• Площа: 17 квадратних метрів.\n• Планування: compactний та комфортний номер для двох гостей.\n• Вулична зона: власний балкон для відпочинку.\n\n🛏️ Спальні місця\n• Основне: одне велике двоспальне ліжко.\n\n🛁 Зручності та сервіс\n• Санвузол: власна ванна кімната в номері.\n• Гігієна: безкоштовні туалетно-косметичні засоби.\n• Зберігання: шафа або гардероб для речей.\n• Зв'язок: безкоштовний бездротовий інтернет (Wi-Fi).\n• Техніка: телевізор із плоским екраном та холодильник.\n\n⛰️ Головні переваги\n• Краєвид: мальовничий вид на гори.\n• Комфорт: затишний номер із усіма базовими зручностями для відпочинку.",
            "сімейний": "📐 Простір та планування\n• Площа: 34 квадратні метри.\n• Кімнати: двокімнатний номер для комфортного сімейного відпочинку.\n• Вулична зона: простора власна тераса.\n• Комфорт: покращена звукоізоляція для спокійного проживання.\n\n🛏️ Спальні місця (до 4 гостей)\n• Основне: одне велике двоспальне ліжко.\n• Додаткове: один великий розкладний диван.\n\n🛁 Зручності та сервіс\n• Харчування: сніданок уже входить у вартість.\n• Санвузол: власна ванна кімната в номері.\n• Гігієна: безкоштовні туалетно-косметичні засоби та тапочки.\n• Зберігання: шафа або гардероб для речей.\n• Зв'язок: безкоштовний бездротовий інтернет (Wi-Fi).\n• Техніка: телевізор із плоским екраном.\n• Додатково: електричний чайник та чашки для гарячих напоїв.\n\n🌿 Головні переваги\n• Простір: ідеально підходить для сім’ї або компанії до 4 осіб.\n• Відпочинок: затишна тераса для ранкової кави чи вечірнього релаксу.\n• Комфорт: поєднання простору, тиші та домашніх зручностей.",
            "сімейний номер": "📐 Простір та планування\n• Площа: 34 квадратні метри.\n• Кімнати: двокімнатний номер для комфортного сімейного відпочинку.\n• Вулична зона: простора власна тераса.\n• Комфорт: покращена звукоізоляція для спокійного проживання.\n\n🛏️ Спальні місця (до 4 гостей)\n• Основне: одне велике двоспальне ліжко.\n• Додаткове: один великий розкладний диван.\n\n🛁 Зручності та сервіс\n• Харчування: сніданок уже входить у вартість.\n• Санвузол: власна ванна кімната в номері.\n• Гігієна: безкоштовні туалетно-косметичні засоби та тапочки.\n• Зберігання: шафа або гардероб для речей.\n• Зв'язок: безкоштовний бездротовий інтернет (Wi-Fi).\n• Техніка: телевізор із плоским екраном.\n• Додатково: електричний чайник та чашки для гарячих напоїв.\n\n🌿 Головні переваги\n• Простір: ідеально підходить для сім’ї або компанії до 4 осіб.\n• Відпочинок: затишна тераса для ранкової кави чи вечірнього релаксу.\n• Комфорт: поєднання простору, тиші та домашніх зручностей.",
            "бюджетний двомісний": "📐 Простір та планування\n• Площа: 17 квадратних метрів.\n• Планування: компактний та практичний номер для двох гостей.\n• Комфорт: хороша звукоізоляція для спокійного відпочинку.\n\n🛏️ Спальні місця\n• Основне: одне двоспальне ліжко.\n\n🛁 Зручності та сервіс\n• Харчування: сніданок уже входить у вартість.\n• Санвузол: власна ванна кімната в номері.\n• Гігієна: безкоштовні туалетно-косметичні засоби та тапочки.\n• Зберігання: шафа або гардероб для речей.\n• Зв'язок: безкоштовний бездротовий інтернет (Wi-Fi).\n• Техніка: телевізор із плоским екраном.\n• Додатково: електричний чайник та чашки для гарячих напоїв.\n\n⛰️ Головні переваги\n• Краєвид: приємний вид на гори.\n• Практичність: оптимальний варіант для комфортного проживання за доступною ціною.\n• Атмосфера: затишний номер для короткого або тривалого відпочинку.",
            "бюджетний двомісний номер": "📐 Простір та планування\n• Площа: 17 квадратних метрів.\n• Планування: компактний та практичний номер для двох гостей.\n• Комфорт: хороша звукоізоляція для спокійного відпочинку.\n\n🛏️ Спальні місця\n• Основне: одне двоспальне ліжко.\n\n🛁 Зручності та сервіс\n• Харчування: сніданок уже входить у вартість.\n• Санвузол: власна ванна кімната в номері.\n• Гігієна: безкоштовні туалетно-косметичні засоби та тапочки.\n• Зберігання: шафа або гардероб для речей.\n• Зв'язок: безкоштовний бездротовий інтернет (Wi-Fi).\n• Техніка: телевізор із плоским екраном.\n• Додатково: електричний чайник та чашки для гарячих напоїв.\n\n⛰️ Головні переваги\n• Краєвид: приємний вид на гори.\n• Практичність: оптимальний варіант для комфортного проживання за доступною ціною.\n• Атмосфера: затишний номер для короткого або тривалого відпочинку.",
            "апартаменти преміум": "📐 Простір та планування\n• Площа: 52 квадратних метри.\n• Кімнати: дві окремі кімнати.\n• Зона готування: повноцінна кухня з посудом і технікою.\n• Вулична зона: власна тераса з краєвидом.\n\n🛏️ Спальні місця (до 4 гостей)\n• Основне: одне велике двоспальне ліжко.\n• Додаткове: один розкладний диван-ліжко.\n\n🛁 Зручності та сервіс\n• Харчування: сніданок уже входить у вартість.\n• Зв'язок: безкоштовний бездротовий інтернет (Wi-Fi).\n• Санвузол: власна ванна кімната в номері.\n• Гігієна: безкоштовні косметичні засоби та капці.\n• Зберігання: велика шафа або гардероб для речей.\n• Побутova техніка: холодильник та кухонне приладдя.\n\n⛰️ Головні переваги та локація\n• Естетика: прямий вид на гори з вікна або тераси.\n• Оздоровлення: поблизу розташовані лікувальні джерела №25, №26 та бювет мінеральної води №2С.\n• Відпочинок на території: затишні альтанки з облаштованою мангальною зоною",
            "преміум": "📐 Простір та планування\n• Площа: 52 квадратних метри.\n• Кімнати: дві окремі кімнати.\n• Зона готування: повноцінна кухня з посудом і технікою.\n• Вулична зона: власна тераса з краєвидом.\n\n🛏️ Спальні місця (до 4 гостей)\n• Основне: одне велике двоспальне ліжко.\n• Додаткове: один розкладний диван-ліжко.\n\n🛁 Зручності та сервіс\n• Харчування: сніданок уже входить у вартість.\n• Зв'язок: безкоштовний бездротовий інтернет (Wi-Fi).\n• Санвузол: власна ванна кімната в номері.\n• Гігієна: безкоштовні косметичні засоби та капці.\n• Зберігання: велика шафа або гардероб для речей.\n• Побутова техніка: холодильник та кухонне приладдя.\n\n⛰️ Головні переваги та локація\n• Естетика: прямий вид на гори з вікна або тераси.\n• Оздоровлення: поблизу розташовані лікувальні джерела №25, №26 та бювет мінеральної води №2С.\n• Відпочинок на території: затишні альтанки з облаштованою мангальною зоною",
            "двокімнатний делюкс": "📐 Простір та планування\n• Площа: 37 квадратних метрів.\n• Кімнати: дві окремі — затишна спальня та простора вітальня з кухонною зоною.\n• Вулична зона: два приватні балкони, кожна кімната має власний вихід.\n• Планування: комфортний і функціональний номер для сімейного відпочинку або тривалого проживання.\n\n🛏️ Спальні місця\n• Основне: одне велике двоспальне ліжко з ортопедичним матрацом.\n• Додаткове: один зручний розкладний диван у вітальні.\n\n🛁 Зручності та сервіс\n• Харчування: власна кухня з усім необхідним посудом, приладдям і технікою для приготування їжі.\n• Санвузол: власна ванна кімната в номері.\n• Гігієна: свіжі рушники, косметичні засоби, м’які халати та індивідуальні тапочки.\n• Зв'язок: безкоштовний Wi-Fi.\n• Техніка: сучасний телевізор у зоні відпочинку.\n\n🌿 Головні переваги\n• Простір: окрема спальня та вітальня забезпечують комфорт і приватність для кожного гостя.\n• Відпочинок: два окремі балкони для ранкової кави та спокійного відпочинку.\n• Автономність: повністю обладнана кухня для зручного проживання.\n• Комфорт: світлий, просторий номер із домашньою атмосферою для короткого чи тривалого відпочинку.",
            "двокімнатний преміум": "📐 Простір та планування\n• Площа: 53 квадратні метри.\n• Кімнати: дві окремі повноцінні кімнати — спальня та вітальня.\n• Вулична зона: власна простора тераса з меблями для відпочинку.\n• Планування: зручний формат для сімейного відпочинку або компанії друзів.\n\n🛏️ Спальні місця (до 4 гостей)\n• Основне: одне велике двоспальне ліжко.\n• Додаткове: один великий розкладний диван.\n\n🛁 Зручності та сервіс\n• Харчування: кухня з усім необхідним для приготування їжі та сервірування.\n• Санвузол: власна простора ванна кімната з душовою кабіною або ванною.\n• Гігієна: індивідуальні косметичні засоби, комплекти м’яких рушників, халати та тапочки.\n• Зберігання: місце для речей та комфортного розміщення під час проживання.\n• Зв’язок: безкоштовний високошвидкісний Wi-Fi.\n• Техніка: Smart-TV, кондиціонер, холодильник, мікрохвильова піч, електричний чайник.\n• Додатково: повний набір посуду, келихи та чайний набір.\n\n🌿 Головні переваги\n• Простір: дві окремі кімнати забезпечують комфортне проживання для 4 гостей.\n• Відпочинок: велика власна тераса для ранкової кави чи вечірнього релаксу.\n• Автономність: сучасна кухня дозволяє легко готувати улюблені страви.\n• Комфорт: щоденне прибирання, оновлення косметики, заміна рушників та компліментарна питна вода включені у вартість."
        };
        const normalized = roomName.toLowerCase().trim();
        return details[normalized] || "Розкішний номер із бездоганним дизайнерським інтер'єром, обладнаний сучасними зручностями. Повні деталі та характеристики будуть опубліковані найближчим часом.";
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
    const lightboxTrack = document.getElementById('lightboxTrack');
    const closeImageModalBtn = document.getElementById('closeImageModal');
    const lightboxPrevBtn = document.getElementById('lightboxPrevBtn');
    const lightboxNextBtn = document.getElementById('lightboxNextBtn');

    // Style zoom-in cursor initially
    document.querySelectorAll('.carousel-item img, .triple-card img, .split-image img, .inspector-image-wrap img, .room-mini-card img, .recap-room-card img, .gallery-item img').forEach(img => {
        img.style.cursor = 'zoom-in';
    });

    let lightboxImages = [];
    let lightboxCurrentIndex = 0;

    const populateLightboxTrack = () => {
        if (!lightboxTrack) return;
        lightboxTrack.innerHTML = '';
        lightboxImages.forEach(src => {
            const slide = document.createElement('div');
            slide.className = 'lightbox-slide';
            // Check if this is one of the 4 horizontal images that shouldn't be cropped
            const isHorizontal = src.includes('DSC08414%20(2)') || src.includes('DSC08414 (2)') || 
                                 src.includes('DSC08417%20(2)') || src.includes('DSC08417 (2)') || 
                                 src.includes('IMG_2354') || src.includes('IMG_2355');
            const imgClass = isHorizontal ? 'class="horizontal-contain"' : '';
            slide.innerHTML = `<img ${imgClass} src="${src}" alt="Перегляд фото">`;
            lightboxTrack.appendChild(slide);
        });
    };

    const updateLightboxImage = () => {
        if (!lightboxTrack || lightboxImages.length === 0) return;
        
        // Buttery-smooth horizontal slide transition!
        lightboxTrack.style.transform = `translateX(-${lightboxCurrentIndex * 100}%)`;

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
        
        populateLightboxTrack();
        
        if (lightboxTrack && imageModal) {
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
            // If user clicked the main room card photo, open the booking modal & pre-select that room!
            if (targetImg.closest('.room-card-image-wrap')) {
                const roomCard = targetImg.closest('.room-card');
                const h3 = roomCard ? roomCard.querySelector('h3') : null;
                const roomName = h3 ? h3.innerText.trim() : (targetImg.alt || "");
                openModal(roomName);
                return;
            }

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
                    
                    populateLightboxTrack();
                    
                    if (lightboxTrack && imageModal) {
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
                
                populateLightboxTrack();
                
                if (lightboxTrack && imageModal) {
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

        // Lock background window scroll on mobile touch swiping
        imageModal.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });
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

    // ---- Luxury In-App Browser Auto-Bypass ----
    function checkInAppBrowser() {
        const ua = navigator.userAgent || navigator.vendor || window.opera;
        const isInApp = (ua.indexOf("FBAN") > -1) || 
                        (ua.indexOf("FBAV") > -1) || 
                        (ua.indexOf("Instagram") > -1) || 
                        (ua.indexOf("Telegram") > -1) || 
                        (ua.indexOf("Messenger") > -1) ||
                        (ua.indexOf("Line") > -1) ||
                        (ua.indexOf("MicroMessenger") > -1);

        if (!isInApp) return;

        const isAndroid = /Android/i.test(ua);
        const isIOS = /iPhone|iPad|iPod/i.test(ua);
        const overlay = document.getElementById('inAppOverlay');
        const androidBtnWrap = document.getElementById('androidButtonWrap');
        const androidIntentBtn = document.getElementById('androidIntentBtn');
        const iosSteps = document.getElementById('iosSteps');

        if (!overlay) return;

        // Clean up preloader immediately so it doesn't block the bypass view
        const preloader = document.querySelector('.preloader');
        if (preloader) preloader.style.display = 'none';

        if (isAndroid) {
            // Android Path: 100% Automatic native browser redirect
            const intentUrl = "intent://elata-pink.vercel.app#Intent;scheme=https;action=android.intent.action.VIEW;end";
            
            // Auto trigger intent
            window.location.href = intentUrl;

            // Display manual fallback button on Android in case of specific browser blocking
            overlay.classList.remove('hidden');
            if (iosSteps) iosSteps.style.display = 'none';
            if (androidBtnWrap) androidBtnWrap.classList.remove('hidden');
            if (androidIntentBtn) {
                androidIntentBtn.setAttribute('href', intentUrl);
            }
        } else if (isIOS) {
            // iOS Path: Show beautiful guided steps dialog
            overlay.classList.remove('hidden');
        } else {
            // Fallback for general webviews
            overlay.classList.remove('hidden');
        }
    }

    // ---- Mangal Slideshow Controller ----
    const initMangalSlideshow = () => {
        const slides = document.querySelectorAll('.mangal-slide');
        const dots = document.querySelectorAll('.mangal-dot');
        if (slides.length === 0) return;
        
        let currentIndex = 0;
        let slideInterval = null;
        
        const showSlide = (index) => {
            slides.forEach((slide, i) => {
                if (i === index) {
                    slide.style.opacity = '1';
                    slide.style.zIndex = '2';
                } else {
                    slide.style.opacity = '0';
                    slide.style.zIndex = '0';
                }
            });
            
            dots.forEach((dot, i) => {
                if (i === index) {
                    dot.style.backgroundColor = 'var(--clr-gold)';
                    dot.classList.add('active');
                } else {
                    dot.style.backgroundColor = 'rgba(255,255,255,0.4)';
                    dot.classList.remove('active');
                }
            });
            currentIndex = index;
        };
        
        const nextSlide = () => {
            let nextIndex = (currentIndex + 1) % slides.length;
            showSlide(nextIndex);
        };
        
        // Auto-change every 3.5 seconds
        slideInterval = setInterval(nextSlide, 3500);
        
        // Manual control via dots
        dots.forEach((dot, i) => {
            dot.addEventListener('click', () => {
                clearInterval(slideInterval);
                showSlide(i);
                // Restart interval
                slideInterval = setInterval(nextSlide, 3500);
            });
        });
    };
    
    initMangalSlideshow();

    // Run sniffer
    // checkInAppBrowser();

    // Background cache warming sync on page load
    syncWithCloud();
});
