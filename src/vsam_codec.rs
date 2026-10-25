use rust_decimal::prelude::*;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Parses a COBOL signed zoned-decimal (overpunch) string (e.g. `00000001940{` or `0000000567P`)
/// into an exact `Decimal` with `scale` fractional digits (2 for `V99`).
pub fn parse_overpunch(raw: &str, scale: u32) -> Result<Decimal, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(Decimal::new(0, scale));
    }
    let bytes = trimmed.as_bytes();
    let last_char = bytes[bytes.len() - 1] as char;
    let prefix = &trimmed[..trimmed.len() - 1];

    let (last_digit, is_negative) = match last_char {
        '{' => ('0', false),
        'A' => ('1', false),
        'B' => ('2', false),
        'C' => ('3', false),
        'D' => ('4', false),
        'E' => ('5', false),
        'F' => ('6', false),
        'G' => ('7', false),
        'H' => ('8', false),
        'I' => ('9', false),
        '}' => ('0', true),
        'J' => ('1', true),
        'K' => ('2', true),
        'L' => ('3', true),
        'M' => ('4', true),
        'N' => ('5', true),
        'O' => ('6', true),
        'P' => ('7', true),
        'Q' => ('8', true),
        'R' => ('9', true),
        c if c.is_ascii_digit() => (c, false),
        other => {
            return Err(format!(
                "Invalid COBOL overpunch byte {:?} in field {:?}",
                other, raw
            ))
        }
    };

    let full_digits = format!("{}{}", prefix, last_digit);
    let mut raw_int: i64 = full_digits
        .parse::<i64>()
        .map_err(|e| format!("Failed parsing digits {:?}: {}", full_digits, e))?;

    if is_negative && raw_int != 0 {
        raw_int = -raw_int;
    }

    Ok(Decimal::new(raw_int, scale))
}

/// Formats an exact `Decimal` back into a fixed-width COBOL overpunch string of `total_digits` characters.
pub fn format_overpunch(val: Decimal, total_digits: usize, scale: u32) -> String {
    let truncated = cobol_truncate_cents(val);
    let is_negative = truncated.is_sign_negative() && !truncated.is_zero();
    let factor = Decimal::new(10_i64.pow(scale), 0);
    let cents = (truncated.abs() * factor).trunc().to_i64().unwrap_or(0);
    let padded = format!("{:0width$}", cents, width = total_digits);
    let slice = if padded.len() > total_digits {
        &padded[padded.len() - total_digits..]
    } else {
        &padded[..]
    };
    let bytes = slice.as_bytes();
    let last_digit = bytes[bytes.len() - 1] as char;
    let overpunch_char = if is_negative {
        match last_digit {
            '0' => '}',
            '1' => 'J',
            '2' => 'K',
            '3' => 'L',
            '4' => 'M',
            '5' => 'N',
            '6' => 'O',
            '7' => 'P',
            '8' => 'Q',
            '9' => 'R',
            _ => '}',
        }
    } else {
        match last_digit {
            '0' => '{',
            '1' => 'A',
            '2' => 'B',
            '3' => 'C',
            '4' => 'D',
            '5' => 'E',
            '6' => 'F',
            '7' => 'G',
            '8' => 'H',
            '9' => 'I',
            _ => '{',
        }
    };
    format!("{}{}", &slice[..slice.len() - 1], overpunch_char)
}

/// Emulates COBOL `PIC S9(09)V99` unrounded `COMPUTE` truncation toward zero at 2 decimal places.
pub fn cobol_truncate_cents(val: Decimal) -> Decimal {
    val.round_dp_with_strategy(2, RoundingStrategy::ToZero)
}

/// Formats a `Decimal` consistently with 2 fractional digits (e.g., `194.00`, `-56.77`).
pub fn fmt_money(val: Decimal) -> String {
    format!("{:.2}", cobol_truncate_cents(val))
}

/// Parses a decimal string (`194.00`) with two decimal places.
pub fn parse_money(s: &str) -> Decimal {
    Decimal::from_str(s.trim()).unwrap_or_else(|_| Decimal::new(0, 2))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountRecord {
    pub acct_id: String,
    pub active_status: String,
    pub initial_bal: Decimal,
    pub curr_bal: Decimal,
    pub credit_limit: Decimal,
    pub cash_credit_limit: Decimal,
    pub open_date: String,
    pub expiration_date: String,
    pub reissue_date: String,
    pub curr_cyc_credit: Decimal,
    pub curr_cyc_debit: Decimal,
    pub addr_zip: String,
    pub group_id: String,
}

impl AccountRecord {
    /// Parses a 300-byte `CVACT01Y.cpy` fixed-width record from `acctdata.txt`.
    pub fn from_fixed_width(line: &str) -> Result<Self, String> {
        let padded = format!("{:<300}", line.trim_end_matches(&['\r', '\n'][..]));
        let curr_bal = parse_overpunch(&padded[12..24], 2)?;
        Ok(Self {
            acct_id: padded[0..11].to_string(),
            active_status: padded[11..12].to_string(),
            initial_bal: curr_bal,
            curr_bal,
            credit_limit: parse_overpunch(&padded[24..36], 2)?,
            cash_credit_limit: parse_overpunch(&padded[36..48], 2)?,
            open_date: padded[48..58].to_string(),
            expiration_date: padded[58..68].to_string(),
            reissue_date: padded[68..78].to_string(),
            curr_cyc_credit: parse_overpunch(&padded[78..90], 2)?,
            curr_cyc_debit: parse_overpunch(&padded[90..102], 2)?,
            addr_zip: padded[102..112].trim().to_string(),
            group_id: padded[112..122].trim().to_string(),
        })
    }

    /// Exports an `AccountRecord` back into a 300-byte `CVACT01Y.cpy` fixed-width record.
    pub fn to_fixed_width(&self) -> String {
        format!(
            "{:<11}{:<1}{}{}{}{:<10}{:<10}{:<10}{}{}{:<10}{:<10}{:<178}",
            self.acct_id,
            self.active_status,
            format_overpunch(self.curr_bal, 12, 2),
            format_overpunch(self.credit_limit, 12, 2),
            format_overpunch(self.cash_credit_limit, 12, 2),
            self.open_date,
            self.expiration_date,
            self.reissue_date,
            format_overpunch(self.curr_cyc_credit, 12, 2),
            format_overpunch(self.curr_cyc_debit, 12, 2),
            self.addr_zip,
            self.group_id,
            ""
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardRecord {
    pub card_num: String,
    pub acct_id: String,
    pub cvv_cd: String,
    pub embossed_name: String,
    pub expiration_date: String,
    pub active_status: String,
}

impl CardRecord {
    pub fn from_fixed_width(line: &str) -> Self {
        let padded = format!("{:<150}", line.trim_end_matches(&['\r', '\n'][..]));
        Self {
            card_num: padded[0..16].to_string(),
            acct_id: padded[16..27].to_string(),
            cvv_cd: padded[27..30].to_string(),
            embossed_name: padded[30..80].trim().to_string(),
            expiration_date: padded[80..90].to_string(),
            active_status: padded[90..91].to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardXrefRecord {
    pub card_num: String,
    pub cust_id: String,
    pub acct_id: String,
}

impl CardXrefRecord {
    pub fn from_fixed_width(line: &str) -> Self {
        let padded = format!("{:<50}", line.trim_end_matches(&['\r', '\n'][..]));
        Self {
            card_num: padded[0..16].to_string(),
            cust_id: padded[16..25].to_string(),
            acct_id: padded[25..36].to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomerRecord {
    pub cust_id: String,
    pub first_name: String,
    pub middle_name: String,
    pub last_name: String,
    pub addr_line_1: String,
    pub addr_line_2: String,
    pub addr_line_3: String,
    pub state_cd: String,
    pub country_cd: String,
    pub zip: String,
    pub phone_1: String,
    pub phone_2: String,
    pub ssn: String,
    pub govt_id: String,
    pub dob: String,
    pub eft_account_id: String,
    pub pri_cardholder_ind: String,
    pub fico_score: i32,
}

impl CustomerRecord {
    pub fn from_fixed_width(line: &str) -> Self {
        let padded = format!("{:<500}", line.trim_end_matches(&['\r', '\n'][..]));
        Self {
            cust_id: padded[0..9].to_string(),
            first_name: padded[9..34].trim().to_string(),
            middle_name: padded[34..59].trim().to_string(),
            last_name: padded[59..84].trim().to_string(),
            addr_line_1: padded[84..134].trim().to_string(),
            addr_line_2: padded[134..184].trim().to_string(),
            addr_line_3: padded[184..234].trim().to_string(),
            state_cd: padded[234..236].trim().to_string(),
            country_cd: padded[236..239].trim().to_string(),
            zip: padded[239..249].trim().to_string(),
            phone_1: padded[249..264].trim().to_string(),
            phone_2: padded[264..279].trim().to_string(),
            ssn: padded[279..288].to_string(),
            govt_id: padded[288..308].trim().to_string(),
            dob: padded[308..318].to_string(),
            eft_account_id: padded[318..328].trim().to_string(),
            pri_cardholder_ind: padded[328..329].to_string(),
            fico_score: padded[329..332].trim().parse::<i32>().unwrap_or(0),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyTranRecord {
    pub tran_id: String,
    pub type_cd: String,
    pub cat_cd: String,
    pub source: String,
    pub desc: String,
    pub amt: Decimal,
    pub amt_raw: String,
    pub merchant_id: String,
    pub merchant_name: String,
    pub merchant_city: String,
    pub merchant_zip: String,
    pub card_num: String,
    pub orig_ts: String,
    pub proc_ts: String,
}

impl DailyTranRecord {
    pub fn from_fixed_width(line: &str) -> Result<Self, String> {
        let padded = format!("{:<350}", line.trim_end_matches(&['\r', '\n'][..]));
        let amt_raw = padded[132..143].to_string();
        let amt = parse_overpunch(&amt_raw, 2)?;
        Ok(Self {
            tran_id: padded[0..16].to_string(),
            type_cd: padded[16..18].to_string(),
            cat_cd: padded[18..22].to_string(),
            source: padded[22..32].trim().to_string(),
            desc: padded[32..132].trim().to_string(),
            amt,
            amt_raw,
            merchant_id: padded[143..152].to_string(),
            merchant_name: padded[152..202].trim().to_string(),
            merchant_city: padded[202..252].trim().to_string(),
            merchant_zip: padded[252..262].trim().to_string(),
            card_num: padded[262..278].to_string(),
            orig_ts: padded[278..304].trim().to_string(),
            proc_ts: padded[304..330].trim().to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_overpunch_roundtrip() {
        assert_eq!(
            parse_overpunch("00000001940{", 2).unwrap(),
            Decimal::new(19400, 2)
        );
        assert_eq!(
            parse_overpunch("0000005047G", 2).unwrap(),
            Decimal::new(50477, 2)
        );
        assert_eq!(
            parse_overpunch("0000000567P", 2).unwrap(),
            Decimal::new(-5677, 2)
        );
        assert_eq!(
            parse_overpunch("0000005358Q", 2).unwrap(),
            Decimal::new(-53588, 2)
        );
        assert_eq!(
            format_overpunch(Decimal::new(19400, 2), 12, 2),
            "00000001940{"
        );
        assert_eq!(
            format_overpunch(Decimal::new(-5677, 2), 11, 2),
            "0000000567P"
        );
    }
}
