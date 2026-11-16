from pathlib import Path
import json, hashlib, re
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(r'C:\Users\Xuân Hoàng\Desktop\Website')
BUILD = ROOT / '.docx-build' / 'demo-20261115'
OUT = ROOT / 'outputs' / 'Kich_ban_thuyet_trinh_va_demo_AnhTraiStore.docx'
BUILD.mkdir(parents=True, exist_ok=True)
OUT.parent.mkdir(exist_ok=True)

# Read the complete first-party project tree and preserve a private source map.
inventory = []
for folder in ['src','views','public','database','scripts','tests','.github']:
    for f in sorted((ROOT/folder).rglob('*')):
        if not f.is_file() or f.suffix not in ['.js','.html','.css','.sql','.yml','.json'] or 'vendor' in f.parts:
            continue
        raw=f.read_bytes()
        text=raw.decode('utf-8-sig')
        inventory.append({'path':str(f.relative_to(ROOT)), 'lines':len(text.splitlines()),
            'sha256':hashlib.sha256(raw).hexdigest(),
            'routes':re.findall(r"(?:router|app)\.(?:get|post|put|delete|patch)\([^\n]+",text),
            'functions':re.findall(r'(?:async\s+)?function\s+([A-Za-z_$][\w$]*)',text)})
for name in ['server.js','package.json','README.md','.env.example']:
    raw=(ROOT/name).read_bytes()
    inventory.append({'path':name,'lines':len(raw.decode('utf-8-sig').splitlines()),'sha256':hashlib.sha256(raw).hexdigest()})
(BUILD/'source-inventory.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2),encoding='utf-8')

doc=Document()
sec=doc.sections[0]
sec.page_width=Cm(21);sec.page_height=Cm(29.7)
sec.top_margin=Cm(1.8);sec.bottom_margin=Cm(1.8)
sec.left_margin=Cm(2.1);sec.right_margin=Cm(2.1)
sec.header_distance=Cm(0.7);sec.footer_distance=Cm(0.8)
for name in ['Normal','Title','Subtitle','Heading 1','Heading 2','Heading 3','List Number','List Bullet']:
    st=doc.styles[name]
    st.font.name='Calibri';st.font.color.rgb=RGBColor(0,0,0)
    st._element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:eastAsia'),'Calibri')
    st._element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:hAnsi'),'Calibri')
normal=doc.styles['Normal']
normal.font.size=Pt(12)
normal.paragraph_format.line_spacing=1.13
normal.paragraph_format.space_after=Pt(6)
normal.paragraph_format.widow_control=True
for name,size in [('Title',28),('Subtitle',14),('Heading 1',19),('Heading 2',14),('Heading 3',12)]:
    st=doc.styles[name];st.font.size=Pt(size)
    st.paragraph_format.space_before=Pt(10 if name!='Title' else 0)
    st.paragraph_format.space_after=Pt(7)
    st.paragraph_format.keep_with_next=True
for name in ['Heading 1','Heading 2','Heading 3']: doc.styles[name].font.bold=True

footer=sec.footer.paragraphs[0]
footer.alignment=WD_ALIGN_PARAGRAPH.RIGHT
run=footer.add_run('AnhTraiStore  ·  ');run.font.size=Pt(9)
field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),'PAGE');footer._p.append(field)
doc.core_properties.title='Kịch bản thuyết trình và demo toàn bộ chức năng AnhTraiStore'
doc.core_properties.subject='Lời thuyết trình và các bước thao tác cho website khách hàng và quản trị'
doc.core_properties.author=''

page_titles=[]
module_index=[]
def p(text='',boldlead=None,italic=False):
    a=doc.add_paragraph()
    if boldlead and text.startswith(boldlead):
        a.add_run(boldlead).bold=True;a.add_run(text[len(boldlead):])
    else:a.add_run(text)
    if italic:
        for r in a.runs:r.italic=True
    return a
def h(text,level=1):return doc.add_heading(text,level)
def page(title):
    if page_titles:doc.add_page_break()
    page_titles.append(title)
    h(title)
def numbered(items,bullet=False):
    numbering=doc.part.numbering_part.element
    existing=[int(el.get(qn('w:abstractNumId'))) for el in numbering.findall(qn('w:abstractNum'))]
    aid=max(existing+[0])+1
    abstract=OxmlElement('w:abstractNum');abstract.set(qn('w:abstractNumId'),str(aid))
    nsid=OxmlElement('w:nsid');nsid.set(qn('w:val'),f'{0xA7100000+aid:08X}');abstract.append(nsid)
    multi=OxmlElement('w:multiLevelType');multi.set(qn('w:val'),'singleLevel');abstract.append(multi)
    lvl=OxmlElement('w:lvl');lvl.set(qn('w:ilvl'),'0')
    for tag,val in [('start','1'),('numFmt','bullet' if bullet else 'decimal'),('lvlText','•' if bullet else '%1.'),('lvlJc','left')]:
        el=OxmlElement('w:'+tag);el.set(qn('w:val'),val);lvl.append(el)
    pp=OxmlElement('w:pPr');ind=OxmlElement('w:ind');ind.set(qn('w:left'),'340');ind.set(qn('w:hanging'),'340');pp.append(ind);lvl.append(pp)
    abstract.append(lvl)
    first_num=numbering.find(qn('w:num'))
    if first_num is not None:first_num.addprevious(abstract)
    else:numbering.append(abstract)
    nums=[int(el.get(qn('w:numId'))) for el in numbering.findall(qn('w:num'))]
    nid=max(nums+[0])+1
    num=OxmlElement('w:num');num.set(qn('w:numId'),str(nid))
    ref=OxmlElement('w:abstractNumId');ref.set(qn('w:val'),str(aid));num.append(ref)
    override=OxmlElement('w:lvlOverride');override.set(qn('w:ilvl'),'0')
    start=OxmlElement('w:startOverride');start.set(qn('w:val'),'1');override.append(start);num.append(override)
    numbering.append(num)
    for text in items:
        a=p(text);np=OxmlElement('w:numPr')
        ilvl=OxmlElement('w:ilvl');ilvl.set(qn('w:val'),'0');np.append(ilvl)
        ni=OxmlElement('w:numId');ni.set(qn('w:val'),str(nid));np.append(ni)
        a._p.get_or_add_pPr().append(np)
        a.paragraph_format.space_after=Pt(3)
def demo(n,title,route,speech,steps,result,note=None,condition=None):
    h(f'{n:02d} {title}',2)
    module_index.append((n,title,route,len(page_titles)))
    p('Trang thao tác: '+route,boldlead='Trang thao tác: ')
    if condition:p('Chuẩn bị: '+condition,boldlead='Chuẩn bị: ')
    p('Lời thuyết trình: '+speech,boldlead='Lời thuyết trình: ')
    numbered(steps)
    p('Kết quả cần chỉ ra: '+result,boldlead='Kết quả cần chỉ ra: ')
    if note:p('Lưu ý khi demo: '+note,boldlead='Lưu ý khi demo: ')
def bullets(items):
    numbered(items,bullet=True)
def table(headers,rows,widths):
    t=doc.add_table(rows=1,cols=len(headers));t.autofit=False
    for c,w in zip(t.columns,widths):c.width=Cm(w)
    for c,text in zip(t.rows[0].cells,headers):c.text=text
    for values in rows:
        for c,text in zip(t.add_row().cells,values):c.text=str(text)
    for ri,row in enumerate(t.rows):
        if ri==0:
            repeat=OxmlElement('w:tblHeader');row._tr.get_or_add_trPr().append(repeat)
        for ci,cell in enumerate(row.cells):
            cell.width=Cm(widths[ci]);cell.vertical_alignment=1
            tcpr=cell._tc.get_or_add_tcPr()
            mar=OxmlElement('w:tcMar')
            for side in ['top','left','bottom','right']:
                a=OxmlElement('w:'+side);a.set(qn('w:w'),'85');a.set(qn('w:type'),'dxa');mar.append(a)
            tcpr.append(mar)
            borders=OxmlElement('w:tcBorders')
            for edge in ['top','left','bottom','right']:
                b=OxmlElement('w:'+edge);b.set(qn('w:val'),'single');b.set(qn('w:sz'),'4');b.set(qn('w:color'),'D9D9D9');borders.append(b)
            tcpr.append(borders)
            shade=OxmlElement('w:shd');shade.set(qn('w:fill'),'E8EDF2' if ri==0 else ('F7F9FB' if ri%2==0 else 'FFFFFF'));tcpr.append(shade)
            for para in cell.paragraphs:
                para.paragraph_format.space_after=Pt(1);para.paragraph_format.line_spacing=1.03
                for r in para.runs:r.font.size=Pt(10.5);r.bold=(ri==0)
    p()
    return t

# 1
page_titles.append('Kịch bản thuyết trình và demo AnhTraiStore')
doc.add_paragraph('Kịch bản thuyết trình và demo AnhTraiStore',style='Title')
doc.add_paragraph('Toàn bộ chức năng website khách hàng và quản trị',style='Subtitle')
p('Tài liệu dành cho người trực tiếp trình bày và thao tác trên website. Nội dung đi theo một buổi demo hoàn chỉnh: khách tìm sản phẩm và đặt hàng, quản trị viên xử lý đơn, sau đó khách đánh giá và gửi yêu cầu hậu mãi.')
p('Mỗi mục gồm lời có thể nói trực tiếp, các bước thao tác và kết quả cần chỉ ra. Các trang chuẩn bị giúp tạo sẵn dữ liệu để không phải chờ đến bước sau mới có đơn đã giao, đánh giá hoặc yêu cầu bảo hành.')
h('Cách dùng tài liệu',2)
bullets(['Mở Word cạnh trình duyệt. Đọc phần “Lời thuyết trình”, sau đó làm theo các bước đánh số.',
 'Dùng hai trình duyệt hoặc hai hồ sơ trình duyệt khác nhau: một cho khách hàng và một cho admin. Hai tab cùng hồ sơ vẫn dùng chung phiên đăng nhập.',
 'Các đường dẫn trong tài liệu là đường dẫn tương đối. Ví dụ /products tương ứng http://localhost:3000/products khi chạy mặc định.',
 'Đánh dấu các mục đã demo ở danh sách kiểm tra cuối tài liệu. Nếu thời gian ngắn, dùng lộ trình rút gọn ở trang 2.'])
h('Phạm vi trình bày',2)
p('Bao gồm giao diện cửa hàng, tài khoản, sản phẩm theo phiên bản, giỏ hàng, coupon, đơn hàng, đánh giá và hỏi đáp, đổi trả và bảo hành, liên hệ, AI, chat trực tiếp và các trang quản trị. Phần cuối có câu trả lời tham khảo cho câu hỏi kỹ thuật và cách xử lý tình huống thường gặp.')
p('Quy ước quan trọng: website là bản mô phỏng thương mại điện tử. VNPay và MoMo dùng bước xác nhận thanh toán mô phỏng. Việc nhập mã vận đơn trong admin không tạo kết nối với hãng vận chuyển.')
p('Ngày đối chiếu mã nguồn: 15 tháng 11 năm 2026.')

# 2
page('Chuẩn bị buổi trình bày')
h('Thời lượng gợi ý',2)
table(['Phần','Nội dung','Thời gian'],[
 ('Mở đầu','Giới thiệu website và hai vai trò','2 phút'),('Khách hàng','Tìm hàng, tài khoản, giỏ hàng, thanh toán, đơn và hậu mãi','18–22 phút'),
 ('Quản trị','Sản phẩm, đơn hàng, kho, người dùng, nội dung và marketing','12–16 phút'),('Kết thúc','Đối chiếu dữ liệu và trả lời câu hỏi','3–5 phút')],[2.4,11.7,2.7])
p('Bản demo đầy đủ cần khoảng 35–45 phút. Nếu chỉ có 15 phút, ưu tiên mục 01, 02, 04, 10, 12–16, 24, 25, 28, 18, 20, 23 và 32. Các thao tác CRUD phụ có thể trình bày bằng dữ liệu đã chuẩn bị.')
h('Tài khoản và cửa sổ trình duyệt',2)
table(['Vai trò','Dữ liệu cần có'],[
 ('Khách chính','Một email mà người demo có thể mở hộp thư. Tài khoản dùng xuyên suốt khi đặt đơn, nhận phản hồi và tạo yêu cầu hậu mãi.'),
 ('Khách phụ','Tài khoản khác để minh họa không đọc được đơn của khách chính, hoặc báo cáo một đánh giá.'),
 ('Quản trị','Nếu database còn dùng tài khoản mẫu: adminanhtrai@gmail.com / admin123. Đăng nhập tại /login rồi mở /admin.'),
 ('Người dùng tạm','Tài khoản chưa có lịch sử nghiệp vụ để demo thêm, sửa và xóa người dùng.')],[3.1,13.7])
h('Thứ tự mở cửa sổ',2)
numbered(['Cửa sổ khách: mở trang chủ, /products, /cart và /orders.',
 'Cửa sổ admin: mở /admin, /admin/products và /admin/orders.',
 'Giữ nguyên phiên khách khi demo chat trực tiếp. Lịch sử khách nhìn thấy được giới hạn theo phiên đăng nhập hiện tại.',
 'Ghi lại mã đơn chính và phiên bản sản phẩm đã chọn để đối chiếu kho, vận chuyển và hậu mãi.'])

# 3
page('Dữ liệu và dịch vụ cần sẵn sàng')
h('Dữ liệu minh họa',2)
numbered(['Chọn hai sản phẩm cùng danh mục để so sánh. Chuẩn bị một sản phẩm có ít nhất hai tổ hợp RAM, ROM hoặc màu với giá và tồn kho khác nhau.',
 'Chuẩn bị một sản phẩm tạm để sửa và xóa. Sản phẩm đã có trong đơn hàng sẽ bị chặn xóa.',
 'Tạo coupon DEMO50K ở /admin/promotions: giảm cố định 50.000đ, đơn tối thiểu 500.000đ, đang hoạt động, còn lượt và hạn dùng sau ngày trình bày.',
 'Chuẩn bị một đơn pending để hủy và một đơn delivered của khách chính để đánh giá, gửi đổi trả hoặc bảo hành.',
 'Chuẩn bị ảnh JPG hoặc PNG: avatar dưới 2 MB, ảnh sản phẩm/banner/minh chứng dưới 5 MB. Ảnh hậu mãi tối đa 4 tệp.',
 'Chuẩn bị đơn mới trong buổi demo để xử lý đầy đủ từ pending, confirmed, shipping đến delivered.'])
h('Kiểm tra trước khi bắt đầu',2)
bullets(['Chạy MySQL và ứng dụng bằng npm start. /health kiểm tra tiến trình web, /ready kiểm tra kết nối database.',
 'SMTP cần hoạt động để nhận OTP và email đơn hàng. Email chạy qua queue nên có thể đến sau phản hồi trên website.',
 'Google OAuth cần cấu hình và callback hợp lệ. Không đủ cấu hình thì đăng nhập bằng email/mật khẩu.',
 'Cloudinary cần hoạt động để tải ảnh mới cho sản phẩm, danh mục, banner, avatar và yêu cầu hậu mãi.',
 'AI cần API key và model hỗ trợ function calling. Chat trực tiếp với admin là luồng riêng và không cần AI.'])
p('Lưu ý về dữ liệu mẫu: các coupon cũ có thể đã hết hạn tại ngày trình bày. Hãy tạo mã demo còn hiệu lực thay vì mặc định WELCOME10 hoặc VIP20 luôn dùng được. Không import lại toàn bộ SQL vào database đang có dữ liệu để chuẩn bị demo.')

# 4
page('Mở đầu và khám phá cửa hàng')
h('Lời mở đầu',2)
p('“Em xin trình bày website AnhTraiStore, mô phỏng hoạt động bán thiết bị công nghệ. Em sẽ bắt đầu với vai trò khách hàng để tìm sản phẩm và đặt đơn, sau đó chuyển sang quản trị để xử lý đơn, quản lý dữ liệu và phản hồi khách. Cuối buổi, em sẽ quay lại tài khoản khách để kiểm tra kết quả.”',italic=True)
demo(1,'Trang chủ và điều hướng','/',
 '“Đây là trang chủ của cửa hàng. Khách có thể vào danh mục, xem sản phẩm nổi bật và mở thông tin chi tiết. Thanh điều hướng cũng là nơi truy cập giỏ hàng, tài khoản, khuyến mãi và hỗ trợ.”',
 ['Mở trang chủ, chuyển các ảnh banner chính và bấm thử một liên kết banner đã cấu hình.',
  'Mở menu danh mục, chọn một nhóm sản phẩm rồi quay lại trang chủ.',
  'Chỉ các khu vực sản phẩm nổi bật, sản phẩm mới và sản phẩm ưu đãi đang có dữ liệu.',
  'Mở một sản phẩm từ trang chủ. Thu nhỏ cửa sổ để chỉ menu trên màn hình nhỏ, sau đó trở lại kích thước demo.'],
 'Các liên kết dẫn đúng trang. Banner đang bật xuất hiện theo cấu hình. Giao diện thay đổi cách bố trí khi cửa sổ nhỏ.',
 'Chỉ giới thiệu các khu vực thực sự xuất hiện tại thời điểm demo. Bảng home_sale_* trong SQL không đồng nghĩa đã có một chức năng flash sale hoàn chỉnh trên giao diện hiện tại.')
p('Câu chuyển tiếp: “Để tìm đúng thiết bị thay vì xem lần lượt từng sản phẩm, em sẽ dùng tìm kiếm và bộ lọc.”',boldlead='Câu chuyển tiếp: ')

# 5
page('Tìm sản phẩm và xem khuyến mãi')
demo(2,'Tìm kiếm và bộ lọc','/products',
 '“Khách có thể tìm theo tên hoặc thương hiệu, rồi kết hợp bộ lọc để thu hẹp kết quả. Kết quả có sắp xếp và phân trang khi số sản phẩm đủ lớn.”',
 ['Gõ tên một sản phẩm có sẵn vào ô tìm kiếm, quan sát gợi ý rồi mở danh sách kết quả.',
  'Chọn danh mục và một hoặc nhiều thương hiệu. Thêm khoảng giá, RAM và ROM phù hợp dữ liệu.',
  'Đổi sắp xếp giữa mới nhất, giá tăng, giá giảm và khuyến mãi nhiều.',
  'Bỏ một bộ lọc, xóa toàn bộ bộ lọc và chuyển trang nếu có nhiều trang kết quả.'],
 'Tên sản phẩm, số lượng kết quả và danh sách thay đổi đúng điều kiện. URL giữ các lựa chọn lọc.',
 'RAM/ROM chỉ xuất hiện khi danh mục có dữ liệu tương ứng. Không chọn đồng thời các điều kiện làm kết quả rỗng nếu muốn giới thiệu sản phẩm ngay sau đó.')
demo(3,'Danh sách sản phẩm khuyến mãi','/promotions',
 '“Trang khuyến mãi tập trung các sản phẩm đang có mức giảm giá. Khách vẫn có thể lọc để tìm sản phẩm phù hợp, sau đó vào chi tiết để mua.”',
 ['Mở /promotions và chỉ giá bán, giá gốc, phần trăm giảm của một sản phẩm.',
  'Thử lọc theo danh mục, thương hiệu, giá hoặc mức giảm có trên giao diện.',
  'Đổi sắp xếp, xóa bộ lọc rồi mở một sản phẩm khuyến mãi.'],
 'Danh sách và phân trang bám theo điều kiện lọc. Giá giảm của sản phẩm và coupon là hai phần khác nhau.',
 'Việc áp coupon được demo ở bước thanh toán. Không cam kết mọi sản phẩm trong trang khuyến mãi đều dùng được mọi mã.')

# 6
page('Chi tiết sản phẩm và phiên bản')
demo(4,'Ảnh và cấu hình theo phiên bản','/product/:id',
 '“Trang chi tiết giúp khách kiểm tra thiết bị trước khi mua. Mỗi phiên bản có tổ hợp RAM, ROM và màu riêng, đồng thời có giá và số lượng tồn riêng. Khi em đổi lựa chọn, hệ thống cập nhật thông tin của đúng phiên bản.”',
 ['Chỉ tên sản phẩm, thương hiệu, giá bán, giá niêm yết và tình trạng còn hàng.',
  'Bấm ảnh thu nhỏ, chuyển ảnh trước/sau và mở trình xem ảnh lớn. Đóng trình xem để tiếp tục.',
  'Đổi dung lượng hoặc tổ hợp bộ nhớ, rồi đổi màu. Chỉ giá, tồn kho và ảnh tương ứng nếu admin đã gắn màu cho gallery.',
  'Mở phần mô tả và thông số kỹ thuật. Chỉ các thông số đã nhập cho sản phẩm.',
  'Chọn tỉnh/thành và quận/huyện tại khu vực dự kiến giao hàng để xem thông tin ước lượng.',
  'Tăng hoặc giảm số lượng, chỉ nút thêm giỏ hàng, mua ngay, yêu thích và so sánh. Cuộn đến sản phẩm liên quan.'],
 'Thông tin giá, SKU hoặc nhận diện phiên bản và tồn kho cập nhật theo lựa chọn. Gallery chỉ chuyển theo màu khi có ảnh gắn màu đó.',
 'Số ngày giao hàng là ước lượng theo địa chỉ trong ứng dụng. Đây chưa phải kết quả từ API hãng vận chuyển. Tổ hợp hết hàng không thể dùng để đặt số lượng vượt kho.',
 'Dùng sản phẩm đã chuẩn bị có từ hai phiên bản và nhiều ảnh. Ghi lại tên, phiên bản và tồn kho ban đầu để đối chiếu sau khi tạo đơn.')
p('Câu chuyển tiếp: “Nếu khách còn phân vân giữa các thiết bị, website có danh sách so sánh và danh sách yêu thích để hỗ trợ lựa chọn.”',boldlead='Câu chuyển tiếp: ')

# 7
page('So sánh và lưu sản phẩm yêu thích')
demo(5,'So sánh sản phẩm','/compare',
 '“Khách có thể đặt nhiều sản phẩm cạnh nhau để so sánh giá và cấu hình. Hệ thống cho phép tối đa bốn sản phẩm và có phần kết luận hỗ trợ lựa chọn.”',
 ['Thêm hai sản phẩm cùng nhóm vào so sánh từ danh sách hoặc trang chi tiết.',
  'Mở /compare, đối chiếu giá, RAM, ROM, màn hình, chipset và tình trạng kho có dữ liệu.',
  'Chờ phần kết luận AI. Bấm Phân tích lại nếu cần, rồi xóa riêng một sản phẩm.',
  'Thử thêm đến giới hạn bốn sản phẩm. Cuối cùng dùng xóa toàn bộ khi không cần giữ danh sách.'],
 'Các sản phẩm hiện theo cột. Có thể mở chi tiết sản phẩm từ bảng. Khi AI không phản hồi, giao diện ghi rõ kết luận dự phòng.',
 'Danh sách so sánh lưu trong localStorage của trình duyệt. Kết luận dự phòng dựa trên điểm giá/cấu hình, không phải phản hồi GPT.')
demo(6,'Danh sách yêu thích','/wishlist',
 '“Sản phẩm yêu thích gắn với tài khoản, giúp khách quay lại các mặt hàng đã quan tâm mà chưa cần đặt mua.”',
 ['Đăng nhập và bấm biểu tượng yêu thích trên hai sản phẩm.',
  'Mở /wishlist, lọc theo thương hiệu rồi đổi sắp xếp có trên giao diện.',
  'Thử thêm một sản phẩm vào giỏ hoặc mua ngay từ danh sách.',
  'Xóa một sản phẩm rồi minh họa xác nhận xóa toàn bộ.'],
 'Danh sách và số lượng yêu thích cập nhật. Sản phẩm vẫn là dữ liệu của đúng tài khoản.',
 'Với sản phẩm có nhiều phiên bản, nên vào chi tiết chọn cấu hình mong muốn trước khi mua.')

# 8
page('Đăng ký đăng nhập và khôi phục tài khoản')
demo(7,'Đăng ký và đăng nhập','/register và /login',
 '“Khách có thể xem hàng trước khi đăng nhập. Tài khoản giúp lưu giỏ hàng, đơn hàng và các yêu cầu hỗ trợ. Website hỗ trợ đăng nhập bằng email/mật khẩu và Google khi đã cấu hình.”',
 ['Mở đăng ký, nhập họ tên, email, số điện thoại và mật khẩu theo biểu mẫu. Điền ngày sinh, giới tính nếu cần.',
  'Tạo tài khoản mới bằng email chưa dùng. Nếu dùng tài khoản đã chuẩn bị, chỉ giới thiệu biểu mẫu rồi chuyển sang đăng nhập.',
  'Đăng nhập bằng email/mật khẩu. Chỉ thông tin tài khoản trên thanh điều hướng.',
  'Giới thiệu nút Google, thử khi dịch vụ sẵn sàng. Minh họa đăng xuất rồi đăng nhập lại nếu cần.'],
 'Tài khoản mới đăng ký thành công. Sau đăng nhập, các thao tác cá nhân gắn với tài khoản đó.',
 'Mật khẩu có độ dài 6–128 ký tự ở backend. Không dùng email đã đăng ký cho thao tác tạo mới.')
demo(8,'Quên mật khẩu bằng OTP','/forgot-password',
 '“Khi quên mật khẩu, khách nhận mã xác nhận qua email, nhập mã rồi đặt mật khẩu mới.”',
 ['Nhập email của tài khoản demo và yêu cầu mã xác nhận.',
  'Mở hộp thư, lấy OTP sáu chữ số và xác thực theo biểu mẫu.',
  'Nhập mật khẩu mới và xác nhận. Quay lại /login để kiểm tra bằng mật khẩu vừa đổi.'],
 'Chỉ OTP hợp lệ mới cho phép đặt lại mật khẩu. OTP hết hạn sau 5 phút và bị vô hiệu khi đã dùng hoặc nhập sai quá số lần cho phép.',
 'Cần SMTP. Không đọc hoặc hiển thị API key, App Password hay nội dung file .env trong lúc trình bày.')

# 9
page('Hồ sơ cá nhân và bảo mật tài khoản')
demo(9,'Thông tin cá nhân avatar và mật khẩu','/profile',
 '“Trang tài khoản gom thông tin cá nhân và tổng quan mua hàng. Khách có thể cập nhật hồ sơ, thay ảnh đại diện và đổi mật khẩu mà không cần nhờ quản trị viên.”',
 ['Mở /profile, chỉ tổng quan tài khoản và danh sách đơn gần đây. Bấm xem đơn để minh họa liên kết.',
  'Sửa họ tên, điện thoại, địa chỉ, ngày sinh hoặc giới tính. Lưu rồi tải lại trang để kiểm tra.',
  'Tải avatar JPG/PNG dưới 2 MB, quan sát ảnh thay đổi. Thử xóa ảnh để quay về ảnh mặc định.',
  'Mở phần đổi mật khẩu, nhập mật khẩu hiện tại, mật khẩu mới và xác nhận. Chỉ báo độ mạnh và kiểm tra khớp trên giao diện.',
  'Lưu mật khẩu mới nếu muốn demo đầy đủ, sau đó đăng nhập lại để kiểm tra. Ghi lại mật khẩu mới cho phần sau.',
  'Bật hoặc tắt các lựa chọn thông báo rồi tải lại cùng trình duyệt.'],
 'Hồ sơ và avatar thay đổi đúng tài khoản. Đổi mật khẩu yêu cầu mật khẩu cũ hợp lệ và mật khẩu mới khác mật khẩu cũ.',
 'Email không sửa trực tiếp từ biểu mẫu hồ sơ khách. Các lựa chọn thông báo hiện lưu trong localStorage, chưa phải cấu hình gửi email hoặc push được đồng bộ trên server. Upload avatar cần Cloudinary.')
p('Câu chuyển tiếp: “Sau khi đã có tài khoản và địa chỉ nhận hàng, em sẽ thực hiện một giao dịch mua hàng để theo dõi xuyên suốt đến bước xử lý đơn.”',boldlead='Câu chuyển tiếp: ')

# 10
page('Giỏ hàng và mua ngay')
demo(10,'Quản lý giỏ hàng và chọn dòng thanh toán','/cart',
 '“Giỏ hàng lưu sản phẩm theo từng phiên bản. Khách có thể mua một phần giỏ hàng bằng cách chỉ chọn những dòng cần thanh toán.”',
 ['Thêm hai phiên bản hoặc hai sản phẩm vào giỏ. Mở /cart và chỉ RAM/ROM/màu của từng dòng.',
  'Tăng giảm số lượng và quan sát thành tiền. Thử số lượng vượt tồn kho để chỉ thông báo chặn.',
  'Tích một dòng rồi chọn tất cả, quan sát số sản phẩm và tiền tương ứng. Mặc định các dòng chưa được tích.',
  'Xóa một dòng để minh họa. Giới thiệu xóa tất cả có xác nhận, nhưng giữ ít nhất một dòng để thanh toán.'],
 'Giỏ chỉ dùng sản phẩm của tài khoản hiện tại. Cùng sản phẩm và cùng phiên bản được cộng số lượng, phiên bản khác là dòng khác.',
 'Chọn ít nhất một dòng trước khi bấm thanh toán. Giá và tồn kho sẽ được backend kiểm tra lại khi tạo đơn.')
demo(11,'Mua ngay từ sản phẩm','/product/:id rồi /checkout?buy_now=...',
 '“Mua ngay đưa đúng sản phẩm và phiên bản đang chọn sang thanh toán, giúp khách đặt nhanh mà không cần chọn lại các dòng trong giỏ.”',
 ['Vào chi tiết, chọn phiên bản còn hàng và số lượng một.',
  'Bấm Mua ngay. Kiểm tra thanh toán hiển thị đúng mặt hàng đã chọn.',
  'Nếu tiếp tục luồng giỏ hàng, quay lại /cart và chọn dòng mua.'],
 'Luồng mua ngay dùng dữ liệu riêng trong session, có thời hạn tối đa 15 phút.',
 'Không để trang mua ngay quá lâu trong khi trình bày các phần khác. Có thể quay về sản phẩm và tạo lại lượt mua ngay.')

# 11
page('Địa chỉ giao hàng và mã giảm giá')
demo(12,'Các bước thanh toán','/checkout',
 '“Thanh toán đi theo thông tin nhận hàng, hình thức giao hàng và phương thức thanh toán. Tổng tiền hiển thị để khách kiểm tra trước khi xác nhận.”',
 ['Nhập họ tên, số điện thoại, email, tỉnh/thành, quận/huyện, phường/xã và địa chỉ chi tiết.',
  'Điền đủ địa chỉ để mở bước giao hàng. Chọn giao tiêu chuẩn rồi giao nhanh để so sánh.',
  'Chỉ thời gian giao dự kiến và thay đổi phí từ 30.000đ sang 50.000đ.',
  'Chọn COD, VNPay hoặc MoMo trên giao diện. Kiểm tra sản phẩm, số lượng, giảm giá và tổng tiền.'],
 'Các bước tiếp theo chỉ mở khi thông tin cần thiết đã đủ. Tổng tiền bằng tiền hàng cộng phí giao hàng trừ số giảm.',
 'Backend hiện dùng phí tiêu chuẩn 30.000đ và nhanh 50.000đ, không tự miễn phí khi đơn đạt 500.000đ.')
demo(13,'Áp dụng và bỏ coupon','Khu vực mã giảm giá ở /checkout',
 '“Coupon được kiểm tra theo giỏ đang mua và tài khoản hiện tại. Mã không đúng điều kiện sẽ có thông báo cụ thể.”',
 ['Chọn mã gợi ý hoặc nhập DEMO50K đã chuẩn bị rồi bấm Áp dụng.',
  'Chỉ số tiền giảm và tổng tiền mới, sau đó bấm bỏ mã để minh họa hoàn tác.',
  'Thử mã không tồn tại hoặc mã chưa đủ giá trị tối thiểu. Cuối cùng áp lại mã hợp lệ để đặt đơn.'],
 'Chỉ một coupon áp dụng cho một đơn. Mỗi tài khoản chỉ dùng một lần cho mỗi mã đã được ghi nhận.',
 'WELCOME10/NEWUSER dành cho đơn đầu. VIP20 cần tổng đơn đã giao từ 30 triệu. PHONE15 chỉ cho các dòng thuộc Điện thoại. FREESHIP là giảm cố định theo cấu hình, không mặc nhiên miễn toàn bộ phí giao.')

# 12
page('Đặt đơn COD và thanh toán mô phỏng')
demo(14,'Đặt hàng thanh toán khi nhận','/checkout với COD',
 '“Với COD, khách xác nhận đặt hàng và thanh toán khi nhận. Sau khi tạo thành công, hệ thống ghi nhận đơn chờ xác nhận và cập nhật kho.”',
 ['Giữ coupon hợp lệ và giao hàng đã chọn. Kiểm tra lại mặt hàng và địa chỉ.',
  'Chọn COD rồi bấm nút tiếp tục hoặc xác nhận đặt hàng theo giao diện.',
  'Ghi mã đơn mới, mở chi tiết và đối chiếu tổng tiền, phương thức COD, trạng thái Chờ xác nhận.',
  'Mở lại giỏ để chỉ các dòng đã mua được xử lý. Dùng cửa sổ admin kiểm tra tồn kho của phiên bản.'],
 'Đơn COD tạo trạng thái pending. Kho và lượt coupon được ghi nhận khi đặt đơn. Email khách và thông báo admin được đưa vào queue.',
 'Không bấm liên tục để tạo nhiều đơn trong lúc chờ phản hồi.')
demo(15,'VNPay và MoMo','/checkout với VNPay hoặc MoMo',
 '“Hai phương thức online trong đồ án dùng thanh toán mô phỏng. Em sẽ tạo đơn rồi dùng nút xác nhận mô phỏng để minh họa bước thanh toán thành công.”',
 ['Chọn một mặt hàng khác hoặc mua lại, chọn VNPay và tạo đơn chờ thanh toán.',
  'Chỉ thông tin mã thanh toán hoặc màn hình thanh toán, sau đó bấm xác nhận thanh toán mô phỏng.',
  'Quan sát đơn chuyển sang confirmed. Lặp lại với MoMo để kiểm tra phương thức còn lại nếu trình bày đầy đủ.'],
 'Lúc khởi tạo đơn online, hệ thống chưa trừ kho. Khi xác nhận thanh toán mô phỏng, hệ thống mới trừ kho và ghi nhận coupon.',
 'Đây không phải giao dịch tiền thật, không quét QR để chuyển tiền. Xác nhận lại một đơn đã xử lý sẽ không được coi là lần thanh toán mới.')

# 13
page('Theo dõi hủy đơn và mua lại')
demo(16,'Danh sách và chi tiết đơn','/orders và /order/:id',
 '“Khách có thể theo dõi các đơn của mình theo trạng thái và xem lại đầy đủ thông tin mua hàng.”',
 ['Mở /orders, chuyển các nhóm Chờ xác nhận, Đã xác nhận, Đang giao, Đã giao và Đã hủy.',
  'Mở đơn vừa tạo, chỉ mã đơn, người nhận, địa chỉ, sản phẩm, phiên bản và tổng tiền.',
  'Chỉ đơn vị vận chuyển, mã vận đơn và lịch sử trạng thái khi đã có dữ liệu.',
  'Sau phần admin, quay lại trang này và tải lại để đối chiếu trạng thái mới.'],
 'Khách thấy thông tin và lịch sử đúng đơn của mình. Thay đổi từ admin xuất hiện khi tải dữ liệu lại.',
 'Theo dõi ở đây là lịch sử trong ứng dụng. Một mã vận đơn được nhập tay chưa chứng minh kiện hàng tồn tại ở hãng giao hàng.')
demo(17,'Hủy đơn chờ và mua lại','/orders hoặc /order/:id',
 '“Khách có thể tự hủy đơn còn chờ xác nhận. Chức năng mua lại giúp đưa các mặt hàng từ đơn cũ về giỏ.”',
 ['Chọn đơn pending đã chuẩn bị, bấm Hủy đơn và xác nhận.',
  'Chỉ trạng thái Đã hủy. Với đơn COD, đối chiếu kho và lượt coupon đã được hoàn lại.',
  'Bấm Mua lại trên đơn có nút này. Mở giỏ và kiểm tra các dòng thêm thành công.'],
 'Khách chỉ tự hủy đơn pending. Mua lại tạo dữ liệu giỏ hàng, không tự tạo một đơn mới.',
 'Mua lại vẫn kiểm tra kho và phiên bản hiện tại. Có thể chỉ thêm được một phần các dòng nếu sản phẩm hết hàng hoặc ngừng bán.')

# 14
page('Đánh giá và hỏi đáp sản phẩm')
demo(18,'Đánh giá sau mua sửa và báo cáo','/product/:id',
 '“Đánh giá mua hàng chỉ mở khi tài khoản đã có đơn giao thành công chứa sản phẩm. Cơ chế này giúp phân biệt phản hồi sau mua với câu hỏi trước mua.”',
 ['Đăng nhập tài khoản có đơn delivered chứa sản phẩm và mở khu vực Đánh giá và hỏi đáp.',
  'Chọn số sao, nhập nhận xét rồi gửi. Chỉ nhãn người đã mua và thống kê sao.',
  'Sửa đánh giá của chính mình, đổi nội dung hoặc số sao rồi lưu.',
  'Dùng tài khoản khách phụ để báo cáo một đánh giá phù hợp dữ liệu demo và nhập lý do.'],
 'Mỗi tài khoản chỉ có một đánh giá cho mỗi sản phẩm. Chủ đánh giá được sửa; báo cáo được đưa vào dữ liệu quản trị.',
 'Đánh giá từ 4 sao nhận lời cảm ơn tự động. Điểm thấp được đánh dấu cần admin xử lý. Không thử gửi lặp một đánh giá đã có nếu muốn tạo mới.')
demo(19,'Câu hỏi sản phẩm và phản hồi','Cùng khu vực hỏi đáp',
 '“Khách đăng nhập có thể đặt câu hỏi ngay cả khi chưa mua. Câu hỏi về dữ liệu sản phẩm có thể được trả lời tự động, còn nội dung cần tư vấn thêm sẽ chuyển cho admin.”',
 ['Chọn hỏi về sản phẩm, nhập “Sản phẩm này có những phiên bản RAM và bộ nhớ nào?” rồi gửi.',
  'Thử câu hỏi về ưu đãi hiện hành để chỉ câu trả lời từ dữ liệu chương trình còn hiệu lực.',
  'Gửi một câu hỏi ngoài phạm vi thông số để minh họa yêu cầu hỗ trợ admin.'],
 'Câu hỏi không tính vào điểm sao. Phản hồi chỉ dựa vào dữ liệu có sẵn hoặc yêu cầu quản trị viên tư vấn thêm.',
 'Có thể đặt nhiều câu hỏi, nhưng backend giới hạn tần suất. Trả lời thông số bằng AI cần dịch vụ AI đang hoạt động.')

# 15
page('Hậu mãi chính sách và liên hệ')
demo(20,'Gửi đổi trả hoặc bảo hành','/order/:id của đơn đã giao',
 '“Sau khi nhận hàng, khách có thể gửi yêu cầu đổi trả hoặc bảo hành cho từng dòng sản phẩm, kèm lý do và ảnh minh chứng.”',
 ['Mở đơn delivered của khách chính, chọn Đổi trả ở một dòng hàng.',
  'Nhập lý do, mô tả, chọn tối đa 4 ảnh dưới 5 MB mỗi ảnh rồi gửi.',
  'Nếu cần minh họa cả hai loại, gửi Bảo hành cho dòng hàng phù hợp.',
  'Mở /orders để xem lịch sử hậu mãi, trạng thái và ghi chú xử lý.'],
 'Yêu cầu mới mang trạng thái submitted. Mỗi dòng đơn được tạo tối đa một yêu cầu cho mỗi loại đổi trả hoặc bảo hành.',
 'Chỉ tài khoản sở hữu đơn đã giao mới gửi được. Chấp thuận yêu cầu chưa đồng nghĩa ứng dụng đã tự hoàn tiền hay tự nhập lại kho.')
demo(21,'Chính sách và biểu mẫu liên hệ','/policy và /contact',
 '“Khách có thể đọc điều kiện sử dụng và gửi liên hệ. Nếu gửi khi đã đăng nhập, nội dung có thể tiếp tục được trao đổi qua hội thoại hỗ trợ.”',
 ['Mở /policy, dùng mục lục để chuyển đến đổi trả, hậu mãi, coupon, vận chuyển và thanh toán.',
  'Mở /contact, điền họ tên, email, điện thoại, chủ đề và nội dung “Em cần hỗ trợ kiểm tra đơn vừa đặt”.',
  'Gửi khi khách chính đang đăng nhập, quan sát thông báo thành công và giữ phiên này để demo chat.'],
 'Liên hệ được lưu. Tài khoản đăng nhập có hội thoại gắn với nội dung để admin phản hồi.',
 'Không giới thiệu ATM, Visa, ZaloPay hay thời hạn đổi trả như luồng đã triển khai chỉ vì có nội dung giới thiệu trên trang chính sách. Backend checkout hiện có COD, VNPay và MoMo.')

# 16
page('Trợ lý AI và chat trực tiếp')
demo(22,'Tư vấn và tra cứu bằng AI','Hộp chat AI trên website',
 '“Trợ lý AI có thể tìm sản phẩm, kiểm tra kho và hướng dẫn mua dựa trên dữ liệu cửa hàng. Khi hỏi về đơn hàng, trợ lý chỉ được tra cứu đơn của tài khoản đang đăng nhập.”',
 ['Mở hộp chat AI, hỏi “Tìm điện thoại Samsung dưới 15 triệu còn hàng”. Điều chỉnh ví dụ theo dữ liệu đang có.',
  'Hỏi tiếp “Máy đầu tiên còn bao nhiêu hàng?” và mở thẻ sản phẩm được gợi ý.',
  'Hỏi “Kiểm tra đơn hàng gần nhất của tôi” khi đã đăng nhập.',
  'Thử hỏi cách mua, chính sách giao hàng hoặc ưu đãi hiện hành.'],
 'AI trả lời tiếng Việt, có sản phẩm liên quan khi tìm được. Kết quả kho và đơn đi qua công cụ truy vấn dữ liệu.',
 'AI không tự xác nhận thanh toán, tự đặt đơn hoặc tự thay đổi trạng thái. Lịch sử chat lưu theo session; yêu cầu dài có thể chạy nền và giao diện chờ kết quả.')
demo(23,'Trao đổi trực tiếp với admin','Widget hỗ trợ và /admin/contacts',
 '“Ngoài AI, khách có thể trao đổi trực tiếp với quản trị viên. Em sẽ dùng hai cửa sổ để minh họa tin nhắn xuất hiện ở cả hai phía.”',
 ['Giữ phiên khách vừa gửi liên hệ. Mở chế độ hỗ trợ trực tiếp trong widget.',
  'Bên admin mở /admin/contacts và chọn hội thoại của khách.',
  'Khách gửi tin mới, admin trả lời “Cửa hàng đã nhận yêu cầu của bạn”.',
  'Chỉ tin nhắn mới, số chưa đọc và dấu đang nhập khi xuất hiện.'],
 'Tin nhắn truyền qua Socket.IO và được lưu. Hai bên nhận thông tin trong hội thoại đúng tài khoản.',
 'Lịch sử khách nhìn thấy giới hạn trong phiên đăng nhập hiện tại, còn admin có thể xem lịch sử được lưu. Giữ nguyên phiên trong toàn bộ phần demo.')

# 17
page('Tổng quan quản trị cửa hàng')
p('Câu chuyển tiếp: “Em chuyển sang tài khoản quản trị để xử lý dữ liệu mà khách vừa tạo. Phần này cho thấy các thao tác mua hàng liên kết với vận hành cửa hàng như thế nào.”',boldlead='Câu chuyển tiếp: ')
demo(24,'Dashboard thống kê và thông báo','/admin',
 '“Dashboard tổng hợp sản phẩm, đơn hàng, khách hàng và doanh thu để admin theo dõi tình hình cửa hàng. Doanh thu ở đây chỉ tính các đơn đã giao.”',
 ['Mở /admin bằng tài khoản admin, chỉ các số tổng quan và số đơn đang chờ.',
  'Giới thiệu doanh thu tháng hiện tại, so sánh tháng trước và biểu đồ doanh thu theo tháng.',
  'Chỉ biểu đồ trạng thái đơn, doanh thu theo ngày, top sản phẩm bán chạy và top khách hàng khi có dữ liệu.',
  'Mở cảnh báo sản phẩm có tổng tồn dưới 20 và vào trang quản lý sản phẩm tương ứng.',
  'Mở chuông thông báo, chỉ đơn chờ hoặc liên hệ chưa đọc, bấm để đi đến trang xử lý.',
  'Sau khi xử lý một đơn thành delivered, quay lại dashboard và làm mới để đối chiếu.'],
 'Dashboard phản ánh dữ liệu thực trong database. Đơn đã hủy không tính vào thống kê bán chạy và chỉ đơn delivered đóng góp vào tổng doanh thu.',
 'Cảnh báo dưới 20 hiện dựa vào tổng tồn sản phẩm. Không khẳng định dashboard đang cảnh báo theo từng phiên bản. Nút đánh dấu đã đọc trên chuông có hành vi giao diện, nên chỉ kết luận dữ liệu đã đọc sau khi kiểm tra trang liên hệ tương ứng.')
h('Các trang admin sẽ đi qua',2)
p('Sản phẩm, Danh mục, Thương hiệu, Lịch sử, Đơn hàng, Khách hàng, Đánh giá, Đổi trả và bảo hành, Liên hệ, Khuyến mãi và Banner. Các mục bổ sung trên thanh bên do JavaScript dùng chung dựng vào giao diện.')

# 18
page('Quản trị sản phẩm và các phiên bản')
demo(25,'Thêm sửa ảnh và tồn kho sản phẩm','/admin/products',
 '“Admin quản lý thông tin chung của sản phẩm và từng phiên bản bán. Mỗi tổ hợp RAM, ROM và màu có SKU, giá bán, giá niêm yết và tồn kho riêng. Ảnh có thể gắn màu để đồng bộ với lựa chọn của khách.”',
 ['Bấm Thêm sản phẩm. Nhập tên, thương hiệu, danh mục và mô tả bằng một sản phẩm tạm.',
  'Chọn danh mục để hiện bộ thông số gợi ý. Điền thông số, thêm hoặc đổi tên trường phù hợp.',
  'Tạo hai phiên bản, ví dụ 8GB/128GB/Đen và 8GB/256GB/Xanh. Nhập giá niêm yết, giá bán và kho khác nhau.',
  'Chọn một phiên bản mặc định. Chỉ SKU được gợi ý hoặc cập nhật theo giao diện.',
  'Tải nhiều ảnh, chọn ảnh đại diện, gắn màu cho ảnh, bỏ một ảnh không cần thiết. Bật hiển thị Sản phẩm nổi bật.',
  'Lưu, mở trang chi tiết ở cửa sổ khách để kiểm tra ảnh, thông số, giá và từng lựa chọn phiên bản.',
  'Mở sửa, đổi giá hoặc tăng kho của một phiên bản. Lưu rồi kiểm tra trang Lịch sử.',
  'Xóa sản phẩm tạm chưa có đơn để minh họa xác nhận. Với sản phẩm đã có đơn, chỉ thông báo bảo toàn lịch sử nếu thử xóa.'],
 'Sản phẩm mới xuất hiện ở cửa hàng. Mức giảm tự tính từ giá của phiên bản. Thay đổi kho tạo bản ghi lịch sử có số trước và sau.',
 'Upload cần Cloudinary. Giá phải hợp lệ và tồn kho không âm. Không thể xóa sản phẩm đã xuất hiện trong đơn. Phiên bản đã được tham chiếu có thể bị vô hiệu hóa để giữ lịch sử thay vì xóa vật lý.',
 'Dùng sản phẩm tạm cho toàn bộ thao tác thay đổi hoặc xóa. Không dùng sản phẩm của đơn chính khi cần giữ dữ liệu cho phần đánh giá và hậu mãi.')

# 19
page('Quản trị danh mục và thương hiệu')
demo(26,'Danh mục sản phẩm','/admin/categories',
 '“Danh mục tổ chức sản phẩm thành nhóm và cung cấp lựa chọn điều hướng ở cửa hàng. Admin có thể tạo danh mục mới, chỉnh tên, slug và ảnh.”',
 ['Mở Danh mục, chỉ tên, ảnh, slug và số sản phẩm đang liên kết.',
  'Thêm danh mục tạm, nhập tên và kiểm tra slug tự tạo. Tải ảnh vuông nếu Cloudinary hoạt động.',
  'Sửa tên hoặc ảnh, lưu và kiểm tra phía cửa hàng.',
  'Xóa danh mục tạm chưa có sản phẩm. Nếu thử danh mục đang dùng, chỉ thông báo không thể xóa.'],
 'Dữ liệu danh mục cập nhật và slug không được trùng. Danh mục có sản phẩm được bảo vệ khỏi xóa.',
 'Backend có trường mẫu thông số kỹ thuật theo danh mục. Biểu mẫu danh mục hiện chủ yếu có tên, slug và ảnh; không hứa có trình sửa mẫu riêng trên trang này.')
demo(27,'Thương hiệu','/admin/brands',
 '“Thương hiệu dùng để gắn hãng cho sản phẩm và tạo bộ lọc phía khách hàng. Admin quản lý danh sách mà không cần chỉnh mã nguồn.”',
 ['Mở Thương hiệu và chỉ số sản phẩm của từng hãng.',
  'Thêm thương hiệu tạm, nhập tên và slug, sau đó lưu.',
  'Sửa tên hoặc slug để minh họa cập nhật.',
  'Xóa thương hiệu tạm chưa có sản phẩm. Giới thiệu quy tắc chặn xóa thương hiệu đang dùng.'],
 'Thương hiệu mới có thể chọn ở biểu mẫu sản phẩm. Thương hiệu có sản phẩm không bị xóa tùy ý.',
 'Bộ lọc khách có thể chỉ hiển thị hãng đang có sản phẩm trong danh mục. Hãng mới tạo nhưng chưa gắn sản phẩm có thể chưa xuất hiện trong bộ lọc.')

# 20
page('Quản trị đơn hàng và vận chuyển')
demo(28,'Xử lý đơn theo luồng trạng thái','/admin/orders',
 '“Admin xử lý đơn theo các trạng thái nghiệp vụ. Em sẽ dùng đơn vừa tạo để xác nhận, cập nhật thông tin vận chuyển, chuyển sang đang giao và cuối cùng đánh dấu đã giao.”',
 ['Lọc Chờ xác nhận, tìm mã đơn COD vừa ghi ở phần khách rồi mở chi tiết.',
  'Đối chiếu khách hàng, địa chỉ, sản phẩm, phiên bản, số lượng, tổng tiền và phương thức thanh toán.',
  'Chuyển pending sang confirmed, thêm ghi chú và lưu.',
  'Nhập đơn vị vận chuyển và mã vận đơn để demo, ví dụ đơn vị “Đơn vị giao hàng nội bộ” và mã “ATSTORE20261115001”.',
  'Chuyển confirmed sang shipping. Quay cửa sổ khách, tải lại chi tiết và chỉ thông tin mới.',
  'Bên admin chuyển shipping sang delivered, thêm ghi chú “Khách đã nhận hàng” rồi lưu.',
  'Bên khách kiểm tra lịch sử trạng thái và mở tính năng đánh giá hoặc yêu cầu hậu mãi.',
  'Dùng đơn phụ nếu cần minh họa admin hủy từ trạng thái còn cho phép.'],
 'Luồng bình thường là pending, confirmed, shipping, delivered. Admin có thể hủy từ pending, confirmed hoặc shipping. Delivered và cancelled là trạng thái kết thúc.',
 'Backend chặn đưa sang Đang giao nếu thiếu thông tin vận chuyển, mã bắt đầu DEMO- hoặc tên đơn vị chứa “mô phỏng”. Mã ví dụ chỉ phục vụ nhập liệu trong đồ án, không phải vận đơn thật. Đổi trả sau giao dùng yêu cầu hậu mãi, không chuyển delivered thành cancelled.')
p('Điểm cần nhấn mạnh: trạng thái online được xác nhận cũng có thể phát sinh ghi nhận kho/coupon ở backend. Không xác nhận lại nhiều lần để minh họa cùng một thao tác.',boldlead='Điểm cần nhấn mạnh: ')

# 21
page('Lịch sử kho và quản lý người dùng')
demo(29,'Sổ biến động kho','/admin/inventory hoặc /admin/history',
 '“Trang Lịch sử cho biết số lượng đã thay đổi như thế nào và liên quan đến thao tác hoặc đơn hàng nào.”',
 ['Mở Lịch sử sau khi đã đặt đơn, hủy đơn và sửa kho sản phẩm.',
  'Chỉ loại thao tác: nhập ban đầu, xuất bán, hoàn kho và cập nhật.',
  'Đối chiếu số trước, số sau, lượng thay đổi, tham chiếu và người thực hiện.',
  'Dùng Làm mới và phân trang để xem các bản ghi khác.'],
 'Thay đổi kho có dấu vết và tham chiếu. Kho theo phiên bản được ghi cùng thông tin nhận diện trong sổ.',
 'Trang này là nơi xem lịch sử. Việc sửa số lượng kho hiện thực hiện trong biểu mẫu sản phẩm/phiên bản, không phải một nút điều chỉnh kho riêng trên trang Lịch sử.')
demo(30,'Thêm sửa và xóa người dùng','/admin/users',
 '“Admin quản lý khách hàng và vai trò của tài khoản. Các thao tác ảnh hưởng quyền đăng nhập được bảo vệ để giữ lịch sử và duy trì tài khoản quản trị.”',
 ['Tạo người dùng tạm với tên, email, điện thoại, mật khẩu và vai trò customer.',
  'Sửa tên hoặc vai trò của người dùng tạm, rồi lưu. Có thể đặt lại mật khẩu qua biểu mẫu.',
  'Xóa người dùng tạm chưa có lịch sử và xác nhận.',
  'Giới thiệu thông báo chặn tự xóa hoặc tự hạ quyền tài khoản admin đang đăng nhập.'],
 'Email phải duy nhất. Tài khoản có đơn, đánh giá/câu hỏi hoặc yêu cầu hậu mãi được giữ lại. Hệ thống giữ ít nhất một admin.',
 'Đổi email, vai trò hoặc mật khẩu có thể kết thúc các phiên khác của người dùng. Không đổi tài khoản khách chính trong khi còn cần demo chat.')

# 22
page('Quản trị phản hồi và yêu cầu hậu mãi')
demo(31,'Phản hồi đánh giá và câu hỏi','/admin/reviews',
 '“Admin xem được đánh giá sau mua và câu hỏi trước mua trong cùng danh sách. Những nội dung cần xử lý và lý do báo cáo giúp admin ưu tiên phản hồi.”',
 ['Tìm đánh giá hoặc câu hỏi đã tạo ở phần khách, chỉ số sao, loại nội dung và phản hồi tự động.',
  'Chỉ nhãn Cần xử lý, số báo cáo và lý do báo cáo nếu có.',
  'Bấm Phản hồi, nhập câu trả lời, lưu rồi sửa phản hồi một lần nếu cần.',
  'Bên khách tải lại sản phẩm để kiểm tra. Xóa một nội dung tạm sau khi xác nhận nếu muốn demo đầy đủ.'],
 'Phản hồi admin xuất hiện công khai dưới nội dung. Xóa nội dung cũng loại bỏ phản hồi đi kèm.',
 'Giao diện hiển thị số lượng/lý do báo cáo, chưa có luồng trạng thái xử lý từng báo cáo riêng để giới thiệu.')
demo(32,'Xử lý đổi trả và bảo hành','/admin/service-requests',
 '“Yêu cầu hậu mãi có quy trình riêng. Admin đọc thông tin, ảnh minh chứng và ghi kết quả để khách theo dõi.”',
 ['Lọc Mới gửi và chọn yêu cầu khách vừa tạo. Đọc lý do, đơn, sản phẩm và ảnh.',
  'Chuyển submitted sang reviewing, nhập ghi chú và lưu.',
  'Chọn approved rồi resolved để minh họa chấp thuận và hoàn tất.',
  'Với yêu cầu phụ, minh họa reviewing sang rejected. Khách vào /orders xem kết quả và ghi chú.'],
 'Luồng chấp thuận là submitted, reviewing, approved, resolved. Nhánh từ chối là reviewing sang rejected.',
 'Rejected và resolved kết thúc yêu cầu. Cập nhật yêu cầu này chưa tự tạo hoàn tiền hoặc tự hoàn kho.')

# 23
page('Quản trị hội thoại và mã giảm giá')
demo(33,'Hội thoại khách hàng','/admin/contacts',
 '“Trang Liên hệ là nơi quản trị viên xử lý hội thoại hỗ trợ. Admin có thể tìm khách, xem lịch sử, trả lời và đóng hoặc mở lại cuộc trao đổi.”',
 ['Tìm hội thoại của khách chính bằng ô tìm kiếm có trên giao diện, chọn cuộc trao đổi.',
  'Đọc nội dung liên hệ và tin nhắn, quan sát bộ đếm chưa đọc khi mở hội thoại.',
  'Gửi phản hồi, kiểm tra ngay ở widget khách.',
  'Đóng hội thoại, chỉ trạng thái đã đóng rồi mở lại để tiếp tục trao đổi.'],
 'Hội thoại hiển thị đúng khách, tin nhắn mới được cập nhật. Admin có thể xem lịch sử lưu trong hệ thống.',
 'Biểu mẫu liên hệ của khách chưa đăng nhập vẫn lưu nội dung, nhưng không tự có hội thoại tài khoản giống khách đã đăng nhập.')
demo(34,'Tạo sửa và xóa coupon','/admin/promotions',
 '“Trang Khuyến mãi trong admin hiện quản lý mã giảm giá. Điều kiện của mã quyết định việc khách có thể áp dụng ở thanh toán.”',
 ['Tạo DEMO50K hoặc một mã mới: mô tả, giảm cố định 50.000đ, đơn tối thiểu 500.000đ.',
  'Chỉ lựa chọn giảm theo phần trăm, mức giảm tối đa, lượt dùng, hạn dùng và trạng thái hoạt động.',
  'Sửa mã hoặc bật/tắt theo biểu mẫu, lưu rồi kiểm tra ở checkout.',
  'Xem thống kê tổng mã, mã đang hoạt động, lượt dùng. Xóa mã tạm chưa dùng khi cần minh họa.'],
 'Mã hết hạn, hết lượt, tắt hoặc không đủ điều kiện bị từ chối. Lượt dùng thay đổi sau đặt COD hoặc xác nhận online.',
 'Không giới thiệu trang này như trình quản lý chiến dịch/banner promotions tổng quát. Các quy tắc đặc biệt gắn với tên mã như VIP20 vẫn được backend áp dụng.')

# 24
page('Quản trị banner và kiểm tra quyền truy cập')
demo(35,'Banner trang chủ','/admin/banners',
 '“Admin có thể thay nội dung quảng bá trên trang chủ bằng ảnh, liên kết và thứ tự hiển thị. Banner chính hỗ trợ một tập tối đa mười ảnh.”',
 ['Mở Banner, xem các vị trí có sẵn và ảnh xem trước.',
  'Thêm hoặc sửa banner tạm với ảnh, tiêu đề, nội dung phụ, đường dẫn và thứ tự theo biểu mẫu.',
  'Với banner chính, chọn tập ảnh trong giới hạn từ 1 đến 10 ảnh, lưu và kiểm tra chuyển ảnh ở trang chủ.',
  'Tắt một banner, tải lại trang chủ, sau đó bật lại. Xóa banner tạm và xác nhận khi cần.'],
 'Banner đang bật hiển thị theo cấu hình. Tập ảnh chính được cập nhật đồng bộ sau khi lưu.',
 'Tải ảnh cần Cloudinary. Nên chuẩn bị ảnh có cùng tỷ lệ. Không xóa toàn bộ tập banner chính đang dùng để minh họa nút xóa.')
demo(36,'Phân quyền và kiểm tra dữ liệu','Cửa sổ khách và admin',
 '“Ngoài thao tác thành công, hệ thống cũng cần chặn truy cập hoặc dữ liệu không hợp lệ. Em minh họa một vài trường hợp ngay trên các luồng vừa chạy.”',
 ['Dùng cửa sổ khách thường mở /admin, chỉ việc từ chối hoặc chuyển về đăng nhập.',
  'Dùng khách phụ mở URL chi tiết đơn của khách chính và chỉ không truy cập được dữ liệu.',
  'Thử số lượng vượt kho, mã coupon không hợp lệ hoặc gửi form thiếu trường bắt buộc.',
  'Chỉ quy tắc một đánh giá cho mỗi sản phẩm và một yêu cầu cùng loại cho mỗi dòng đơn.'],
 'Các giới hạn hoạt động ở backend, không chỉ dựa vào việc ẩn nút trên giao diện.',
 'Chọn vài trường hợp kiểm tra đại diện. Không gửi nhiều yêu cầu sai liên tục vì đăng nhập, OTP, hỏi đáp và AI có rate limit.')

# 25
page('Lời kết và câu trả lời kỹ thuật')
h('Lời kết có thể đọc trực tiếp',2)
p('“Qua phần demo, em đã thực hiện hành trình của khách từ tìm sản phẩm, chọn phiên bản, đặt hàng đến theo dõi đơn và gửi phản hồi. Ở phía quản trị, em đã xử lý đơn, kiểm tra kho và cập nhật nội dung cửa hàng. Các thao tác liên kết với nhau qua dữ liệu chung nên kết quả ở admin có thể đối chiếu lại từ tài khoản khách.”',italic=True)
p('“Phạm vi hiện tại là mô phỏng thương mại điện tử. Hướng phát triển tiếp theo là tích hợp thanh toán thật có xác thực giao dịch, kết nối vận chuyển và bổ sung quy trình hoàn tiền. Em xin kết thúc phần trình bày và sẵn sàng trả lời câu hỏi.”',italic=True)
h('Công nghệ và cấu trúc',2)
p('Frontend dùng HTML, CSS và JavaScript thuần. Backend dùng Node.js, Express và MySQL. Socket.IO phục vụ chat trực tiếp. Passport hỗ trợ Google OAuth, Nodemailer gửi email, Multer kết hợp Cloudinary xử lý ảnh và OpenAI API cung cấp các chức năng AI.')
p('Các luồng đơn hàng và quản trị người dùng có lớp controller, service và repository. Không nên nói toàn bộ route đều đã tách hoàn toàn theo kiến trúc này vì vẫn còn các route chứa nhiều logic nghiệp vụ.')
h('Vì sao không tin giá từ trình duyệt',2)
p('Backend truy vấn lại giá, tồn kho, phí giao hàng và coupon trước khi tạo đơn. Việc sửa giao diện hoặc payload không được dùng làm nguồn giá chính thức. Các thay đổi quan trọng được xử lý trong transaction.')
h('Session OTP và công việc nền lưu ở đâu',2)
p('Session, rate limit và queue nền lưu trong MySQL. OTP lưu dưới dạng HMAC trong reset_tokens, có thời hạn và giới hạn số lần sai. Email và công việc AI dài có thể chạy nền; phản hồi website thành công không đồng nghĩa email đã đến hộp thư ngay lúc đó.')
h('AI biết dữ liệu cửa hàng bằng cách nào',2)
p('Backend cung cấp các công cụ tìm sản phẩm, đọc chi tiết, kiểm tra kho, gợi ý, tra đơn và thông tin cửa hàng. AI gọi công cụ, nhận kết quả rồi trả lời. Kiểm tra quyền sở hữu đơn vẫn do backend thực hiện. AI không có chức năng tự ghi đơn hoặc thực hiện thanh toán trong luồng đã demo.')

# 26
page('Danh sách kiểm tra phần khách hàng')
p('Đánh dấu sau mỗi phần đã trình bày. Số mục trùng với kịch bản để tra nhanh trong Navigation Pane của Word hoặc dùng Ctrl+F.')
table(['Xong','Mục','Chức năng cần thể hiện'],[
 ('□','01','Trang chủ, banner, menu danh mục và giao diện màn hình nhỏ'),
 ('□','02–03','Gợi ý tìm kiếm, lọc, sắp xếp, phân trang và sản phẩm khuyến mãi'),
 ('□','04','Gallery, phóng ảnh, phiên bản, giá/kho, thông số và giao dự kiến'),
 ('□','05–06','So sánh tối đa 4, AI/dự phòng, yêu thích, lọc, xóa và mua từ danh sách'),
 ('□','07–09','Đăng ký, đăng nhập, Google, đăng xuất, OTP, hồ sơ, avatar và mật khẩu'),
 ('□','10–11','Giỏ theo phiên bản, số lượng, chọn dòng, xóa và mua ngay'),
 ('□','12–13','Địa chỉ, giao tiêu chuẩn/giao nhanh, áp và bỏ coupon'),
 ('□','14–15','Đặt COD, VNPay/MoMo mô phỏng, thời điểm trừ kho'),
 ('□','16–17','Danh sách đơn, chi tiết, lịch sử trạng thái, hủy pending và mua lại'),
 ('□','18–19','Đánh giá sau mua, sửa, báo cáo và hỏi đáp trước mua'),
 ('□','20–21','Đổi trả, bảo hành, lịch sử hậu mãi, chính sách và biểu mẫu liên hệ'),
 ('□','22–23','AI tra sản phẩm/đơn và chat trực tiếp giữa hai cửa sổ')],[1.2,1.7,13.9])
h('Các điểm phải kiểm tra chéo',2)
bullets(['Đúng tài khoản và đúng phiên bản sản phẩm ở giỏ, đơn hàng và lịch sử kho.',
 'Tổng tiền thay đổi đúng phí tiêu chuẩn 30.000đ hoặc nhanh 50.000đ và coupon đang áp.',
 'Admin đổi trạng thái, khách xem lại lịch sử rồi mới đánh giá hoặc gửi yêu cầu hậu mãi.',
 'Báo rõ khi phần kết luận là dự phòng, thanh toán là mô phỏng và mã vận đơn là dữ liệu demo.'])

# 27
page('Danh sách kiểm tra phần quản trị')
table(['Xong','Mục','Chức năng cần thể hiện'],[
 ('□','24','Dashboard, doanh thu đơn đã giao, biểu đồ, top và cảnh báo tồn'),
 ('□','25','Thêm/sửa/xóa sản phẩm, thông số theo danh mục, gallery và ảnh theo màu'),
 ('□','25','Phiên bản RAM/ROM/màu, SKU, giá, kho, mặc định và nổi bật'),
 ('□','26–27','Thêm/sửa/xóa danh mục và thương hiệu, ảnh danh mục, chặn xóa khi đang dùng'),
 ('□','28','Lọc/xem đơn, xác nhận, nhập vận chuyển, giao hàng, hoàn tất và nhánh hủy'),
 ('□','29','Lịch sử nhập, xuất bán, hoàn kho, điều chỉnh và phân trang'),
 ('□','30','Thêm/sửa/xóa người dùng, vai trò, mật khẩu và bảo vệ admin'),
 ('□','31','Phản hồi/sửa phản hồi, nội dung cần xử lý, báo cáo và xóa đánh giá'),
 ('□','32','Lọc yêu cầu hậu mãi, xem ảnh, duyệt/từ chối/hoàn tất và ghi chú'),
 ('□','33','Tìm hội thoại, xem lịch sử, trả lời, đóng và mở lại'),
 ('□','34','Tạo/sửa/xóa coupon, kiểu giảm, ngưỡng, hạn, lượt và bật/tắt'),
 ('□','35–36','Banner, tập 1–10 ảnh chính, thứ tự, liên kết, bật/tắt và phân quyền')],[1.2,1.7,13.9])
h('Dữ liệu nên giữ đến cuối buổi',2)
p('Giữ đơn chính đã giao, sản phẩm và phiên bản của đơn đó, một đánh giá đã phản hồi, một yêu cầu hậu mãi đã xử lý và hội thoại khách/admin. Đây là các dữ liệu dễ mở lại khi có câu hỏi. Chỉ xóa những bản ghi tạm đã chuẩn bị cho thao tác xóa.')
h('Những gì không nên giới thiệu thành chức năng đã hoàn tất',2)
p('Thanh toán tiền thật, webhook ngân hàng, đồng bộ hãng vận chuyển, hoàn tiền tự động, push notification, đồng bộ cài đặt thông báo giữa thiết bị hoặc trình quản lý flash sale đầy đủ. Chỉ trình bày những hành vi đã có trên luồng thao tác và phân biệt nội dung giới thiệu với chức năng xử lý thực tế.')

# 28
page('Xử lý tình huống trong lúc demo')
h('Không vào được website hoặc không tải dữ liệu',2)
p('Kiểm tra tiến trình web bằng /health và kết nối database bằng /ready. Nếu /ready chưa sẵn sàng, kiểm tra MySQL và cấu hình DB. Nếu cổng chạy khác 3000, thay URL theo cấu hình thực tế. Không import lại dữ liệu mẫu để sửa lỗi kết nối.')
h('Không gửi được OTP hoặc chưa nhận email',2)
p('Kiểm tra SMTP, hộp thư rác và thời gian chờ queue. Có thể dùng tài khoản đã đăng nhập để tiếp tục phần mua hàng, rồi quay lại OTP sau khi dịch vụ sẵn sàng. Khi nhập mã phải dùng OTP mới nhất còn hạn 5 phút.')
h('Không áp dụng được mã giảm giá',2)
p('Kiểm tra đang hoạt động, ngày hiệu lực, lượt dùng, giá trị đơn và tài khoản đã dùng mã chưa. Với PHONE15, kiểm tra các dòng đang thanh toán đều thuộc danh mục Điện thoại. Nếu mã mẫu hết hạn, tạo mã demo mới còn hạn qua admin.')
h('Không chuyển được đơn sang đang giao',2)
p('Đảm bảo đơn đã confirmed. Nhập đủ đơn vị vận chuyển và mã vận đơn, không dùng mã bắt đầu DEMO- hoặc tên đơn vị chứa “mô phỏng”. Giải thích đây là dữ liệu trình diễn, không khẳng định đã có kết nối với hãng vận chuyển.')
h('Không có nút đánh giá hoặc không gửi được hậu mãi',2)
p('Kiểm tra đúng tài khoản mua hàng và đơn đã delivered. Nếu đã có đánh giá thì dùng sửa đánh giá. Nếu đã gửi yêu cầu cùng loại cho dòng hàng thì mở lịch sử để theo dõi, không tạo lặp.')
h('AI hoặc upload ảnh gặp lỗi',2)
p('AI cần dịch vụ được cấu hình và có thể bị timeout/rate limit. Dùng tìm kiếm/bộ lọc hoặc chat trực tiếp để tiếp tục phần chính. Upload cần Cloudinary và ảnh đúng định dạng/dung lượng. Không mô tả phần dự phòng như một phản hồi AI thành công.')
h('Nguồn mã để đối chiếu sau buổi demo',2)
p('Trang và giao diện: src/routes/pages.js, views/*.html, views/admin/*.html, public/js/app.js và public/js/checkout.js. Nghiệp vụ: src/routes/products.js, cart.js, orders.js, coupons.js, auth.js, api.js, admin.js, service-requests.js và messages.js. AI: src/services/store-ai.js, product-qa.js và src/routes/ai-chat.js. Kho và trạng thái: src/services/inventory.js, stock-ledger.js và order-tracking.js. Cấu trúc dữ liệu: database/anhtraistore.sql. Hướng dẫn chạy: README.md.')

# Force a clean black heading hierarchy without theme residue.
for name in ['Title','Subtitle','Heading 1','Heading 2','Heading 3']:
    style=doc.styles[name]
    for c in style._element.xpath('.//w:color'):
        for attr in ['themeColor','themeTint','themeShade']:
            c.attrib.pop(qn('w:'+attr),None)
        c.set(qn('w:val'),'000000')
    for b in style._element.xpath('.//w:pBdr'):
        b.getparent().remove(b)
for para in doc.paragraphs:
    if para.style.name in ['Title','Subtitle','Heading 1','Heading 2','Heading 3']:
        for run in para.runs:run.font.color.rgb=RGBColor(0,0,0)

doc.save(OUT)
(BUILD/'expected-pages.json').write_text(json.dumps({'pages':page_titles,'modules':module_index},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'output':str(OUT),'planned_pages':len(page_titles),'modules':len(module_index),'source_files':len(inventory)},ensure_ascii=False))
