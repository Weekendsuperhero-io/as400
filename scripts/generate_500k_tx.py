import sys
import time
from pathlib import Path

def main():
    start_time = time.time()
    data_dir = Path(__file__).resolve().parent.parent / "data" / "ASCII"
    out_file = data_dir / "dailytran_500k.txt"
    cards_file = data_dir / "carddata.txt"

    cards = []
    for line in open(cards_file, "r", encoding="utf-8"):
        c = line[:16].strip()
        if len(c) == 16 and c.isdigit():
            cards.append(c)

    if not cards:
        print("Error: No cards loaded from carddata.txt")
        sys.exit(1)

    print(f"Loaded {len(cards)} card numbers. Generating 500,000 transactions...")

    # Overpunch maps for cents
    pos_overpunch = ['{', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']
    neg_overpunch = ['}', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R']

    def to_overpunch(cents: int, is_negative: bool = False) -> str:
        s = f"{abs(cents):011d}"
        last_digit = int(s[-1])
        char = neg_overpunch[last_digit] if is_negative else pos_overpunch[last_digit]
        return s[:-1] + char

    merchants = [
        ("Costco Wholesale #471", "Issaquah", "98027"),
        ("Abshire-Lowe Logistics", "North Enoshaven", "72112"),
        ("Amazon Web Services Retail", "Seattle", "98109"),
        ("Target Corp #1204", "Minneapolis", "55403"),
        ("Home Depot Supply Store", "Atlanta", "30339"),
        ("Walmart Supercenter #205", "Bentonville", "72716"),
        ("Trader Joe Market #601", "Monrovia", "91016"),
        ("Best Buy Electronics #88", "Richfield", "55423"),
        ("Chevron Fuel Station", "San Ramon", "94583"),
        ("Walgreens Pharmacy #104", "Deerfield", "60015"),
    ]

    total_count = 500_000
    batch_size = 10_000
    written = 0

    with open(out_file, "w", encoding="utf-8", buffering=1024 * 1024 * 8) as f:
        buffer = []
        for i in range(1, total_count + 1):
            card = cards[i % len(cards)]
            m_idx = (i * 7) % len(merchants)
            m_name, m_city, m_zip = merchants[m_idx]

            # 90% purchases (01), 10% returns (03)
            is_return = (i % 10 == 0)
            type_cd = "03" if is_return else "01"
            cat_cd = f"{(i % 5) + 1:04d}"
            source = "OPERATOR  " if is_return else "POS TERM  "

            action_str = "Return item at " if is_return else "Purchase at "
            desc = f"{action_str}{m_name}".ljust(100)[:100]

            # Amount between $5.00 and $450.00 in cents
            cents = 500 + ((i * 137) % 44500)
            amt_raw = to_overpunch(cents, is_negative=is_return)

            tran_id = f"{i:016d}"
            merchant_id = f"8{m_idx:08d}"
            m_name_col = m_name.ljust(50)[:50]
            m_city_col = m_city.ljust(50)[:50]
            m_zip_col = m_zip.ljust(10)[:10]
            orig_ts = f"2026-10-25 12:{(i % 60):02d}:{(i % 60):02d}.000000"
            padding = " " * 46

            line = f"{tran_id}{type_cd}{cat_cd}{source}{desc}{amt_raw}{merchant_id}{m_name_col}{m_city_col}{m_zip_col}{card}{orig_ts}{padding}\n"
            buffer.append(line)

            if len(buffer) >= batch_size:
                f.writelines(buffer)
                written += len(buffer)
                buffer.clear()

        if buffer:
            f.writelines(buffer)
            written += len(buffer)

    elapsed = time.time() - start_time
    file_size_mb = out_file.stat().st_size / (1024 * 1024)
    print(f"Generated {written:,} transactions in {elapsed:.2f}s ({file_size_mb:.2f} MB)")
    print(f"Target: {out_file}")

if __name__ == "__main__":
    main()
