"""Rule-based starter assistant. Replace `generate_answer` with an AI provider later."""

_RULES: list[tuple[tuple[str, ...], dict[str, str]]] = [
    (
        ("wifi", "wi-fi", "internet", "mạng", "network", "vpn"),
        {
            "vi": "Mình có thể hỗ trợ kiểm tra kết nối mạng cơ bản:\n"
                  "1) Kiểm tra Wi-Fi/LAN đang kết nối.\n"
                  "2) Trên Windows chạy `ipconfig` để xem IPv4 và Default Gateway.\n"
                  "3) Chạy `ping <Default-Gateway>` rồi `ping 8.8.8.8`.\n"
                  "4) Nếu ping IP được nhưng không mở website, thử `nslookup google.com`.\n"
                  "Không gửi mật khẩu hoặc thông tin nhạy cảm vào chat. Nếu vẫn lỗi, hãy tạo Ticket.",
            "en": "Let's run some basic network checks:\n"
                  "1) Confirm Wi-Fi/LAN is connected.\n"
                  "2) On Windows run `ipconfig` and note the IPv4 address and Default Gateway.\n"
                  "3) Run `ping <Default-Gateway>`, then `ping 8.8.8.8`.\n"
                  "4) If pinging an IP works but websites do not open, try `nslookup google.com`.\n"
                  "Never send passwords or sensitive data in chat. If it still fails, create a ticket.",
        },
    ),
    (
        ("printer", "máy in", "print"),
        {
            "vi": "Bạn hãy kiểm tra máy in có nguồn và kết nối mạng/USB, xem hàng đợi in có bị kẹt, "
                  "rồi thử hủy job lỗi và in trang test. Nếu máy in dùng chung, kiểm tra bạn truy cập được "
                  "print server. Nếu chưa xử lý được, hãy tạo Ticket.",
            "en": "Check that the printer is powered on and connected (network/USB), look for a stuck print "
                  "queue, cancel the failed job and print a test page. For a shared printer, make sure you can "
                  "reach the print server. If that does not help, create a ticket.",
        },
    ),
    (
        ("outlook", "email", "mail"),
        {
            "vi": "Bạn hãy kiểm tra Internet, mở Outlook ở chế độ bình thường, xem trạng thái kết nối "
                  "và thử Outlook Web nếu doanh nghiệp có cung cấp. Không chia sẻ mật khẩu hoặc mã MFA. "
                  "Nếu lỗi vẫn tồn tại, hãy tạo Ticket.",
            "en": "Check your Internet connection, open Outlook normally, look at the connection status and "
                  "try Outlook on the web if your organisation provides it. Never share passwords or MFA "
                  "codes. If the problem remains, create a ticket.",
        },
    ),
    (
        ("password", "mật khẩu", "account", "tài khoản"),
        {
            "vi": "Vì lý do bảo mật, mình không yêu cầu bạn gửi mật khẩu hoặc mã MFA. "
                  "Hãy dùng quy trình self-service/reset password chính thức của tổ chức hoặc liên hệ IT. "
                  "Nếu tài khoản bị khóa, tạo Ticket để IT xác minh danh tính.",
            "en": "For security reasons I will never ask for your password or MFA code. Use your "
                  "organisation's official self-service/password reset process or contact IT. If the "
                  "account is locked, create a ticket so IT can verify your identity.",
        },
    ),
]

_FALLBACK = {
    "vi": "Mình là QIT AI Assistant phiên bản MVP. Bạn mô tả thêm: hệ điều hành/ứng dụng gặp lỗi, "
          "thông báo lỗi chính xác (ẩn dữ liệu nhạy cảm), thời điểm xảy ra và các bước đã thử. "
          "Mình có thể hỗ trợ Network, máy in, Email và tài khoản ở mức cơ bản. "
          "Nếu không giải quyết được, hãy tạo Ticket để IT Support tiếp nhận.",
    "en": "I am the QIT AI Assistant (MVP). Please tell me more: the operating system/application, "
          "the exact error message (hide sensitive data), when it happened and what you already tried. "
          "I can help with basic network, printer, email and account issues. "
          "If that does not solve it, create a ticket for IT Support.",
}

MODE = "starter-rule-based"


def generate_answer(message: str, lang: str = "vi") -> str:
    lang = lang if lang in ("vi", "en") else "vi"
    text = message.lower()
    for keywords, answers in _RULES:
        if any(keyword in text for keyword in keywords):
            return answers[lang]
    return _FALLBACK[lang]
