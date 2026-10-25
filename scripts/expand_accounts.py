#!/usr/bin/env python3
"""
Expands the CardDemo SQLite database with realistic synthetic accounts, customers,
primary cards, cross-references, and transaction histories.
"""

import sqlite3
import random
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(SCRIPT_DIR, '..', 'carddemo.db')

first_names = [
    'Liam', 'Olivia', 'Noah', 'Emma', 'Oliver', 'Charlotte', 'James', 'Amelia', 'Sophia', 'Benjamin',
    'Lucas', 'Henry', 'Alexander', 'Mason', 'Michael', 'Ethan', 'Daniel', 'Matthew', 'Aiden', 'Jackson',
    'Logan', 'David', 'Joseph', 'Samuel', 'Sebastian', 'Andrew', 'Harper', 'Evelyn', 'Abigail', 'Emily',
    'Elizabeth', 'Mila', 'Ella', 'Avery', 'Sofia', 'Camila', 'Aria', 'Scarlett', 'Victoria', 'Madison',
    'Luna', 'Grace', 'Chloe', 'Penelope', 'Layla', 'Riley', 'Zoey', 'Nora', 'Lily', 'Eleanor',
    'Hannah', 'Lillian', 'Addison', 'Aubrey', 'Ellie', 'Stella', 'Natalie', 'Leah', 'Hazel', 'Violet',
    'Aurora', 'Savannah', 'Audrey', 'Brooklyn', 'Bella', 'Claire', 'Skylar', 'Lucy', 'Paisley', 'Everly',
    'Anna', 'Caroline', 'Nova', 'Genesis', 'Emilia', 'Kennedy', 'Samantha', 'Maya', 'Willow', 'Kinsley',
    'Naomi', 'Aaliyah', 'Elena', 'Sarah', 'Arianna', 'Allison', 'Gabriella', 'Alice', 'Madelyn', 'Cora',
    'Ruby', 'Eva', 'Serenity', 'Autumn', 'Adeline', 'Hailey', 'Gianna', 'Valentina', 'Isla', 'Eliana'
]

last_names = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
    'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
    'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
    'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
    'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts',
    'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker', 'Cruz', 'Edwards', 'Collins', 'Reyes',
    'Stewart', 'Morris', 'Morales', 'Murphy', 'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper'
]

states_zips = [
    ('CA', '94105', 'San Francisco'), ('NY', '10001', 'New York'), ('TX', '78701', 'Austin'),
    ('WA', '98101', 'Seattle'), ('IL', '60601', 'Chicago'), ('FL', '33101', 'Miami'),
    ('MA', '02108', 'Boston'), ('CO', '80202', 'Denver'), ('NC', '28202', 'Charlotte'),
    ('GA', '30303', 'Atlanta'), ('VA', '22201', 'Arlington'), ('OH', '43215', 'Columbus'),
    ('AZ', '85001', 'Phoenix'), ('OR', '97201', 'Portland'), ('PA', '19102', 'Philadelphia')
]

merchants = [
    ('Whole Foods Market', '0001', '01', 'Groceries'),
    ('Delta Air Lines', '0002', '01', 'Airlines'),
    ('Amazon.com', '0001', '01', 'Online Retail'),
    ('Chevron Gas Station', '0001', '01', 'Fuel'),
    ('Starbucks Coffee', '0001', '01', 'Dining'),
    ('Apple Store', '0001', '01', 'Electronics'),
    ('Target Store #1024', '0001', '01', 'General Merchandise'),
    ('Uber Technologies', '0002', '01', 'Rideshare & Transit'),
    ('Netflix Subscription', '0001', '01', 'Entertainment'),
    ('Home Depot', '0001', '01', 'Home Improvement')
]

def main(target_total=250):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute('SELECT MAX(CAST(acct_id AS INTEGER)) FROM accounts')
    max_acct = cursor.fetchone()[0] or 0
    print(f'Existing max account: {max_acct}')

    if max_acct >= target_total:
        print(f'Already at or above target {target_total} accounts.')
        conn.close()
        return

    random.seed(42)
    added = 0

    for i in range(max_acct + 1, target_total + 1):
        acct_id = f'{i:011d}'
        cust_id = f'{i:09d}'

        first = random.choice(first_names)
        middle = random.choice(first_names)
        last = random.choice(last_names)
        state, zip_cd, city = random.choice(states_zips)

        phone1 = f'({random.randint(200,999)}){random.randint(200,999):03d}-{random.randint(1000,9999):04d}'
        phone2 = f'({random.randint(200,999)}){random.randint(200,999):03d}-{random.randint(1000,9999):04d}'
        ssn = f'{random.randint(100,899):03d}{random.randint(10,99):02d}{random.randint(1000,9999):04d}'
        govt_id = f'000000000000{random.randint(10000000,99999999):08d}'
        dob = f'{random.randint(1955, 2002):04d}-{random.randint(1,12):02d}-{random.randint(1,28):02d}'
        eft_id = f'{random.randint(100000000,999999999):09d}'
        fico = random.randint(580, 840)

        cursor.execute('''
            INSERT OR REPLACE INTO customers (
                cust_id, first_name, middle_name, last_name, addr_line_1, addr_line_2, addr_line_3,
                state_cd, country_cd, zip, phone_1, phone_2, ssn, govt_id, dob, eft_account_id,
                pri_cardholder_ind, fico_score
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            cust_id, first, middle, last, f'{random.randint(100, 9999)} Market St', f'Suite {random.randint(100, 900)}',
            city, state, 'USA', zip_cd, phone1, phone2, ssn, govt_id, dob, eft_id, 'Y', fico
        ))

        cred_lim = random.choice([3000, 5000, 7500, 10000, 15000, 20000, 25000])
        cash_lim = int(cred_lim * 0.4)
        curr_bal = round(random.uniform(150.0, cred_lim * 0.45), 2)
        init_bal = round(curr_bal * 0.8, 2)
        open_yr = random.randint(2012, 2022)
        open_date = f'{open_yr}-{random.randint(1,12):02d}-{random.randint(1,28):02d}'
        exp_date = f'{open_yr + 10}-{random.randint(1,12):02d}-{random.randint(1,28):02d}'
        reissue_date = exp_date
        addr_zip = f'A{zip_cd.ljust(9, "0")[:9]}'

        cursor.execute('''
            INSERT OR REPLACE INTO accounts (
                acct_id, active_status, initial_bal, curr_bal, credit_limit, cash_credit_limit,
                open_date, expiration_date, reissue_date, curr_cyc_credit, curr_cyc_debit, addr_zip, group_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            acct_id, 'Y', f'{init_bal:.2f}', f'{curr_bal:.2f}', f'{cred_lim:.2f}', f'{cash_lim:.2f}',
            open_date, exp_date, reissue_date, '0.00', '0.00', addr_zip, ''
        ))

        card_prefix = random.choice(['4', '5', '3'])
        card_num = card_prefix + ''.join(str(random.randint(0, 9)) for _ in range(15))
        cvv = f'{random.randint(100, 999):03d}'
        embossed = f'{first.upper()} {last.upper()}'

        cursor.execute('''
            INSERT OR REPLACE INTO cards (
                card_num, acct_id, cvv_cd, embossed_name, expiration_date, active_status
            ) VALUES (?, ?, ?, ?, ?, ?)
        ''', (card_num, acct_id, cvv, embossed, exp_date, 'Y'))

        cursor.execute('''
            INSERT OR REPLACE INTO card_xref (card_num, cust_id, acct_id)
            VALUES (?, ?, ?)
        ''', (card_num, cust_id, acct_id))

        num_tx = random.randint(2, 4)
        total_tx = 0.0
        for t_idx in range(num_tx):
            tran_id = f'{i:04d}{t_idx:04d}{random.randint(1000, 9999):04d}'
            m_name, cat_cd, type_cd, m_cat = random.choice(merchants)
            amt = round(random.uniform(12.50, 240.00), 2)
            total_tx += amt
            m_id = f'8000{random.randint(1000, 9999):04d}'
            orig_ts = f'2026-{random.randint(1,10):02d}-{random.randint(1,28):02d} {random.randint(8,21):02d}:{random.randint(10,59):02d}:00'
            proc_ts = f'2026-10-25-00.00.00.000000'

            cursor.execute('''
                INSERT OR REPLACE INTO transactions (
                    tran_id, acct_id, type_cd, cat_cd, source, description, amt,
                    merchant_id, merchant_name, merchant_city, merchant_zip, card_num,
                    orig_ts, proc_ts
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                tran_id, acct_id, type_cd, cat_cd, 'POS TERM', f'{m_cat} at {m_name}', f'{amt:.2f}',
                m_id, m_name, city, zip_cd, card_num, orig_ts, proc_ts
            ))

        cursor.execute('''
            INSERT OR REPLACE INTO tran_cat_balances (acct_id, tran_type_cd, tran_cat_cd, tran_cat_bal)
            VALUES (?, '01', '0001', ?)
        ''', (acct_id, f'{total_tx:.2f}'))

        added += 1

    conn.commit()
    conn.close()
    print(f'Successfully expanded accounts: +{added} records inserted.')

if __name__ == '__main__':
    main()
