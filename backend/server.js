const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// ==========================
// ПІДКЛЮЧЕННЯ ДО БД
// ==========================

const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'pharmacy_db',
    waitForConnections: true,
    connectionLimit: 10, // Максимальна кількість одночасних з'єднань
    queueLimit: 0
});

// Тестовий запит для перевірки з'єднання (замість db.connect)
db.getConnection((err, connection) => {
    if (err) {
        console.error('Помилка підключення до БД:', err);
        return;
    }
    console.log('✅ Підключено до пулу MySQL (phpMyAdmin)');
    connection.release(); // Обов'язково повертаємо з'єднання в пул
});

// ===================================================
// ПОШУК ЛІКІВ ДЛЯ КОРИСТУВАЧІВ (РЕЛЕВАНТНІСТЬ + ПОПУЛЯРНІСТЬ)
// ===================================================
app.get('/api/search', (req, res) => {
    const query = req.query.q || '';
    const category = req.query.cat || '';
    const sort = req.query.sort || 'relevance';
    const minPrice = req.query.minPrice || 0;
    const maxPrice = req.query.maxPrice || 5000;
    const manufacturer = req.query.manufacturer || '';
    const isPromo = req.query.promo === 'true';

    let sql = `SELECT * FROM medicines WHERE 1=1`;
    let params = [];

    // 1. Фільтрація за текстом запиту
    if (query) {
        sql += ` AND (name LIKE ? OR manufacturer LIKE ? OR active_substance LIKE ? OR description LIKE ?)`;
        params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
    }

    // 2. Фільтрація за категорією
    if (category) {
        sql += ` AND category = ?`;
        params.push(category);
    }

    // 3. Фільтрація за виробником
    if (manufacturer) {
        sql += ` AND manufacturer = ?`;
        params.push(manufacturer);
    }

    // 4. Фільтрація за акційним статусом
    if (isPromo) {
        sql += ` AND is_promo = 1`;
    }

    // 5. Фільтрація за діапазоном цін
    sql += ` AND price BETWEEN ? AND ?`;
    params.push(minPrice, maxPrice);

    // ===================================================
    // РОЗУМНЕ СОРТУВАННЯ ТА РАНЖУВАННЯ ВИДАЧІ
    // ===================================================
    if (sort === 'price_asc') {
        sql += ` ORDER BY price ASC`;
    } else if (sort === 'price_desc') {
        sql += ` ORDER BY price DESC`;
    } else {
        // Якщо обрано сортування за "релевантністю" (або за замовчуванням)
        if (query) {
            // Комбінований алгоритм: текстовий збіг + популярність (views)
            sql += ` ORDER BY 
                (name LIKE ?) DESC,      /* 1. Пріоритет: Назва ПОЧИНАЄТЬСЯ з пошукового слова */
                (name LIKE ?) DESC,      /* 2. Пріоритет: Назва МІСТИТЬ пошукове слово всередині */
                views DESC,              /* 3. Пріоритет: Товари з більшою кількістю переглядів */
                name ASC                 /* 4. Резерв: Алфавітний порядок при рівних показниках */
            `;
            // Передаємо параметри для умов LIKE у блоці ORDER BY
            params.push(`${query}%`, `%${query}%`);
        } else {
            // Якщо користувач не ввів текст (просто відкрив каталог чи категорію),
            // показуємо спочатку найпопулярніші за переглядами товари
            sql += ` ORDER BY views DESC, name ASC`;
        }
    }

    // Виконання запиту до бази даних
    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('Помилка БД при пошуку ліків:', err);
            return res.status(500).json({ error: 'Помилка БД при пошуку ліків' });
        }
        res.json(results);
    });
});

// ==========================
// АВТОДОПОВНЕННЯ ПОШУКУ (ПІДКАЗКИ)
// ==========================
app.get('/api/autocomplete', (req, res) => {
    const query = req.query.q || '';
    if (!query) return res.json([]);

    const sql = `SELECT id, name FROM medicines WHERE name LIKE ? LIMIT 5`;

    db.query(sql, [`%${query}%`], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Помилка БД автодоповнення' });
        }
        res.json(results);
    });
});

// ==========================
// АНАЛОГИ ПРЕПАРАТУ
// ==========================

app.get('/api/medicines/:id/analogs', (req, res) => {
    const medicineId = req.params.id;

    const getMedicineSql = `SELECT active_substance FROM medicines WHERE id = ?`;

    db.query(getMedicineSql, [medicineId], (err, medicineResult) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Помилка БД при пошуку діючої речовини' });
        }

        if (medicineResult.length === 0) {
            return res.status(404).json({ error: 'Препарат не знайдено' });
        }

        const substance = medicineResult[0].active_substance;

        const analogsSql = `
            SELECT * FROM medicines
            WHERE active_substance = ? AND id != ?
            ORDER BY price ASC
        `;

        db.query(analogsSql, [substance, medicineId], (err, analogs) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Помилка БД при отриманні аналогів' });
            }
            res.json(analogs);
        });
    });
});

// ==========================
// АПТЕКИ З НАЯВНІСТЮ ТОВАРУ
// ==========================

app.get('/api/medicines/:id/pharmacies', (req, res) => {
    const medicineId = req.params.id;

    const sql = `
        SELECT
            pharmacies.id,
            pharmacies.name,
            pharmacies.address,
            pharmacies.phone,
            inventory.stock
        FROM inventory
                 JOIN pharmacies ON inventory.pharmacy_id = pharmacies.id
        WHERE inventory.medicine_id = ? AND inventory.stock > 0
    `;

    db.query(sql, [medicineId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Помилка БД при запиті наявності в аптеках' });
        }
        res.json(results);
    });
});

// ==========================
// СТВОРЕННЯ ЗАМОВЛЕННЯ (З ПЕРЕВІРКОЮ ТА СПИСАННЯМ З inventory)
// ==========================

app.post('/api/orders', async (req, res) => {
    const {
        customer_name,
        customer_phone,
        pharmacy_id,
        items,
        total_price,
        order_number
    } = req.body;

    if (!pharmacy_id || !items || items.length === 0) {
        return res.status(400).json({ error: 'Некоректні дані замовлення' });
    }

    try {
        const promiseDb = db.promise();
        let missingItems = [];

        // 1. ПЕРЕВІРКА ЗАЛИШКІВ В ТАБЛИЦІ inventory
        for (let item of items) {
            const qty = item.quantity || 1;
            const [rows] = await promiseDb.query(
                'SELECT stock FROM inventory WHERE pharmacy_id = ? AND medicine_id = ?',
                [pharmacy_id, item.id]
            );

            if (rows.length === 0 || rows[0].stock < qty) {
                missingItems.push(item.name);
            }
        }

        if (missingItems.length > 0) {
            return res.status(400).json({
                error: 'Недостатньо товару в цій аптеці',
                missingItems: missingItems
            });
        }

        // 2. СПИСАННЯ ЗАЛИШКІВ З ІНВЕНТАРЯ
        for (let item of items) {
            const qty = item.quantity || 1;
            await promiseDb.query(
                'UPDATE inventory SET stock = stock - ? WHERE pharmacy_id = ? AND medicine_id = ?',
                [qty, pharmacy_id, item.id]
            );
        }

        // ===================================================
        // 3. СТВОРЕННЯ ЗАМОВЛЕННЯ В ТАБЛИЦІ orders (ДОДАЛИ order_number)
        // ===================================================
        const sql = `
            INSERT INTO orders (customer_name, customer_phone, pharmacy_id, total_price, items_json, status, order_number)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await promiseDb.query(sql, [
            customer_name,
            customer_phone,
            pharmacy_id,
            total_price,
            JSON.stringify(items),
            'new',
            order_number
        ]);

        res.json({
            success: true,
            orderId: result.insertId
        });

    } catch (err) {
        console.error('Помилка обробки замовлення:', err);
        res.status(500).json({ error: 'Помилка сервера при створенні замовлення' });
    }
});

// ==========================
// ПОПУЛЯРНІ ПРЕПАРАТИ (ТОП-8 ЗА ПЕРЕГЛЯДАМИ)
// ==========================
app.get('/api/medicines/popular', (req, res) => {
    const sql = `SELECT * FROM medicines ORDER BY views DESC LIMIT 8`;

    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Помилка БД при отриманні популярних товарів' });
        }
        res.json(results);
    });
});

// ==========================
// ОТРИМАТИ ПРЕПАРАТ ПО ID (+1 ДО ПЕРЕГЛЯДІВ)
// ==========================
app.get('/api/medicines/:id', (req, res) => {
    const id = req.params.id;

    db.query(`UPDATE medicines SET views = views + 1 WHERE id = ?`, [id], (updateErr) => {
        if (updateErr) console.error('Помилка оновлення переглядів:', updateErr);
    });

    const sql = `SELECT * FROM medicines WHERE id = ?`;

    db.query(sql, [id], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Помилка сервера при отриманні товару' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Препарат не знайдено' });
        }

        res.json(results[0]);
    });
});

// ==========================
// ОТРИМАТИ СПИСОК УСІХ АПТЕК (З ФІЛЬТРОМ ПО МІСТУ)
// ==========================
app.get('/api/pharmacies', (req, res) => {
    const city = req.query.city || '';

    let sql = "SELECT * FROM pharmacies";
    let params = [];

    if (city) {
        sql += " WHERE address LIKE ?";
        params.push(`%${city}%`);
    }

    sql += " ORDER BY name ASC";

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Помилка БД при отриманні списку аптек' });
        }
        res.json(results);
    });
});

// ===================================================
// АПТЕКАР / АДМІН: ОТРИМАННЯ ВСІХ ЗАМОВЛЕНЬ (З АПТЕКАМИ)
// ===================================================
app.get('/api/admin/orders', (req, res) => {
    const sql = `
        SELECT orders.*, pharmacies.name AS pharmacy_name, pharmacies.address AS pharmacy_address
        FROM orders
                 LEFT JOIN pharmacies ON orders.pharmacy_id = pharmacies.id
        ORDER BY orders.created_at DESC
    `;
    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Помилка отримання замовлень з БД' });
        }
        res.json(results);
    });
});

// ===================================================
// АПТЕКАР: ОНОВЛЕННЯ СТАТУСУ ЗАМОВЛЕННЯ
// ===================================================
app.put('/api/orders/:id/status', (req, res) => {
    const orderId = req.params.id;
    const { status } = req.body;

    const sql = `UPDATE orders SET status = ? WHERE id = ?`;
    db.query(sql, [status, orderId], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Помилка оновлення статусу замовлення' });
        }
        res.json({ success: true, message: 'Статус успішно оновлено' });
    });
});

// ==========================
// АДМІН: ДОДАВАННЯ НОВОЇ АПТЕКИ
// ==========================
app.post('/api/pharmacies', (req, res) => {
    const { name, address, phone, lat, lng } = req.body;

    const sql = `
        INSERT INTO pharmacies (name, address, phone, lat, lng)
        VALUES (?, ?, ?, ?, ?)
    `;
    db.query(sql, [name, address, phone, lat, lng], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Помилка додавання аптеки в БД' });
        }
        res.json({ success: true, pharmacyId: result.insertId });
    });
});

// ===================================================
// АДМІН: ДОДАВАННЯ ПРЕПАРАТУ ТА ПОСТАВКИ В ІНВЕНТАР (ЗВ'ЯЗКА З inventory)
// ===================================================
app.post('/api/medicines', (req, res) => {
    const {
        name,
        manufacturer,
        active_substance,
        price,
        category,
        description,
        image_url,
        is_promo,
        pharmacy_id,
        stock
    } = req.body;

    const sqlMeds = `
        INSERT INTO medicines (name, manufacturer, active_substance, price, category, description, image_url, is_promo, views)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `;
    const paramsMeds = [name, manufacturer, active_substance, price, category, description || '', image_url || '', is_promo || 0];

    db.query(sqlMeds, paramsMeds, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Помилка додавання препарату в БД' });
        }

        const medicineId = result.insertId;

        // Логіка поставки: якщо адмін вибрав аптеку і вказав кількість ліків
        if (pharmacy_id && stock !== undefined && stock !== null) {
            const sqlInv = `
                INSERT INTO inventory (medicine_id, pharmacy_id, stock)
                VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE stock = stock + VALUES(stock)
            `;
            db.query(sqlInv, [medicineId, pharmacy_id, stock], (errInv) => {
                if (errInv) {
                    console.error('Помилка додавання в інвентар:', errInv);
                    return res.json({
                        success: true,
                        medicineId,
                        note: 'Препарат додано, але виникла помилка з оновленням залишків інвентаря'
                    });
                }
                res.json({ success: true, medicineId, message: 'Препарат та поставку успішно зафіксовано!' });
            });
        } else {
            res.json({ success: true, medicineId, message: 'Препарат додано без початкової поставки' });
        }
    });
});

// ===================================================
// АДМІН: ПОПОВНЕННЯ ЗАЛИШКІВ ІСНУЮЧОГО ПРЕПАРАТУ
// ===================================================
app.post('/api/inventory/restock', (req, res) => {
    const { medicine_id, pharmacy_id, stock } = req.body;

    if (!medicine_id || !pharmacy_id || !stock) {
        return res.status(400).json({ error: 'Некоректні дані' });
    }

    const sql = `
        INSERT INTO inventory (medicine_id, pharmacy_id, stock)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE stock = stock + VALUES(stock)
    `;

    db.query(sql, [medicine_id, pharmacy_id, stock], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Помилка оновлення залишків' });
        }
        res.json({ success: true, message: 'Залишки успішно поповнено!' });
    });
});

// ===================================================
// АДМІН: ОНОВЛЕННЯ ЦІНИ ТА ЗНИЖКИ
// ===================================================
app.post('/api/medicines/update-price', (req, res) => {
    const { id, price, old_price, is_promo } = req.body;

    if (!id || !price) {
        return res.status(400).json({ error: 'Некоректні дані' });
    }

    // Оновлюємо ціну, стару ціну та статус акції
    const sql = `UPDATE medicines SET price = ?, old_price = ?, is_promo = ? WHERE id = ?`;

    // Якщо old_price пусте, записуємо null
    const finalOldPrice = old_price ? old_price : null;

    db.query(sql, [price, finalOldPrice, is_promo, id], (err, result) => {
        if (err) {
            console.error('Помилка оновлення ціни:', err);
            return res.status(500).json({ error: 'Помилка БД при оновленні ціни' });
        }
        res.json({ success: true, message: 'Ціну успішно оновлено!' });
    });
});

// ===================================================
// ВИДАЛЕННЯ ЗАМОВЛЕННЯ ТА ПОВЕРНЕННЯ ЗАЛИШКІВ
// ===================================================
app.delete('/api/orders/:id', async (req, res) => {
    const orderId = req.params.id;

    try {
        const promiseDb = db.promise();

        // 1. Отримуємо дані замовлення (щоб знати, з якої аптеки і які ліки повертати)
        const [orders] = await promiseDb.query('SELECT pharmacy_id, items_json FROM orders WHERE id = ?', [orderId]);

        if (orders.length === 0) {
            return res.status(404).json({ error: 'Замовлення не знайдено' });
        }

        const order = orders[0];
        const pharmacy_id = order.pharmacy_id;

        let items = [];
        try {
            items = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : order.items_json;
        } catch (e) {
            items = [];
        }

        // 2. Повертаємо залишки на склад аптеки
        if (pharmacy_id && items && items.length > 0) {
            for (let item of items) {
                const qty = item.quantity || 1;
                await promiseDb.query(
                    'UPDATE inventory SET stock = stock + ? WHERE pharmacy_id = ? AND medicine_id = ?',
                    [qty, pharmacy_id, item.id]
                );
            }
        }

        // 3. Видаляємо саме замовлення з бази
        await promiseDb.query('DELETE FROM orders WHERE id = ?', [orderId]);

        res.json({ success: true, message: 'Замовлення скасовано, залишки повернуто на склад.' });

    } catch (err) {
        console.error('Помилка видалення замовлення:', err);
        res.status(500).json({ error: 'Помилка сервера при скасуванні замовлення' });
    }
});

// ==========================
// ЗАПУСК СЕРВЕРА
// ==========================
app.listen(3000, () =>
    console.log('✅ Сервер успішно працює на порту 3000')
);