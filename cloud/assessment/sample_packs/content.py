"""Two original grade-10 sample packs. No official textbook alignment is claimed."""


def mc(level, text, choices, correct, solution):
    return dict(level=level, type='MC', question=text, options=choices, correct=correct,
                option_explanations=[('Đúng. ' if i == correct else 'Chưa đúng. ')+solution for i in range(4)])


def es(level, text, steps):
    return dict(level=level, type='ES', question=text,
                rubric=[dict(criterion=s, points=0.25) for s in steps],
                equivalent_answer_policy='Chấp nhận cách giải tương đương đúng lập luận và kết quả. Quy đổi bốn tiêu chí theo điểm câu trong đề; không trừ điểm hai lần cho cùng một sai sót.')


PACKS = [
 dict(code='toan', name='Toán', marker='sample-toan-10-v1', competency='TDLL', lessons=[
  dict(code='B1', name='Mệnh đề và tập hợp', topic='Mệnh đề. Tập hợp', outcomes=[
   'Nhận biết mệnh đề và xác định các phép toán cơ bản trên tập hợp.',
   'Giải thích phép phủ định mệnh đề và quan hệ giữa các tập hợp.',
   'Vận dụng phép toán tập hợp để giải bài toán đếm hoặc tìm giao các khoảng.'], questions=[
   mc('Biết','Phát biểu nào sau đây là một mệnh đề đúng?', ['2 + 3 = 5.','Hãy mở sách!','Bạn tên gì?','x > 1.'],0,'Mệnh đề có giá trị đúng hoặc sai xác định. 2 + 3 = 5 là mệnh đề đúng; câu lệnh, câu hỏi và biểu thức còn biến chưa xác định không phải mệnh đề.'),
   mc('Biết','Cho A = {1; 2; 3}, B = {2; 3; 4}. Tập A ∩ B là gì?', ['{1; 4}','{2; 3}','{1; 2; 3; 4}','{1}'],1,'Giao gồm các phần tử thuộc đồng thời A và B, nên A ∩ B = {2; 3}.'),
   mc('Hiểu','Cho A = {1; 2; 3}, B = {3; 4}. Số phần tử của A ∪ B bằng bao nhiêu?', ['5','3','4','2'],2,'A ∪ B = {1; 2; 3; 4}; phần tử 3 chỉ được đếm một lần, nên có 4 phần tử.'),
   mc('Hiểu','Phủ định của mệnh đề “Với mọi số thực x, x² ≥ 0” là gì?', ['Với mọi số thực x, x² < 0.','Tồn tại số thực x sao cho x² < 0.','Tồn tại số thực x sao cho x² ≥ 0.','Với mọi số thực x, x² > 0.'],1,'Phủ định của ∀x, P(x) là ∃x, không P(x); phủ định của x² ≥ 0 là x² < 0.'),
   mc('Vận dụng','Lớp có 40 học sinh; 20 em thích Toán, 18 em thích Vật lí, 8 em thích cả hai. Có bao nhiêu em không thích cả hai môn (không thích môn nào)?', ['2','8','10','30'],2,'Có 20 + 18 − 8 = 30 em thích ít nhất một môn. Số không thích môn nào là 40 − 30 = 10.'),
   mc('Vận dụng','Cho A = (−∞; 3], B = [1; 5). Tập A ∩ B bằng gì?', ['[1; 3]','(1; 3)','[1; 5)','(−∞; 5)'],0,'Điều kiện đồng thời x ≤ 3 và 1 ≤ x < 5 tương đương 1 ≤ x ≤ 3; hai đầu mút đều được lấy.'),
   es('Hiểu','Cho A = {−2; −1; 0; 1; 2}, B = {0; 1; 2; 3}. Tìm A ∩ B, A ∪ B, A \\ B và số phần tử của A ∪ B.', ['Xác định A ∩ B = {0; 1; 2}.','Xác định A ∪ B = {−2; −1; 0; 1; 2; 3}.','Xác định A \\ B = {−2; −1}.','Kết luận A ∪ B có 6 phần tử.']),
   es('Vận dụng','Lớp có 40 học sinh; 25 em thích Toán, 20 em thích Vật lí, 10 em thích cả hai. Tính số em thích ít nhất một môn, chỉ thích Toán, chỉ thích Vật lí và không thích môn nào.', ['Dùng công thức hợp: 25 + 20 − 10 = 35 em thích ít nhất một môn.','Chỉ thích Toán: 25 − 10 = 15 em.','Chỉ thích Vật lí: 20 − 10 = 10 em.','Không thích môn nào: 40 − 35 = 5 em.'])]),
  dict(code='B2', name='Bất phương trình bậc nhất hai ẩn', topic='Bất phương trình và hệ bất phương trình bậc nhất hai ẩn', outcomes=[
   'Nhận biết bất phương trình bậc nhất hai ẩn và kiểm tra một cặp số có là nghiệm.',
   'Giải thích đường biên và miền nghiệm của bất phương trình bậc nhất hai ẩn.',
   'Mô hình hóa và giải bài toán đơn giản bằng hệ bất phương trình hai ẩn.'], questions=[
   mc('Biết','Bất phương trình nào là bậc nhất hai ẩn x, y?', ['x² + y ≤ 6','xy ≤ 6','x + 2y ≤ 6','1/x + y ≤ 6'],2,'Dạng ax + by ≤ c có a, b không đồng thời bằng 0 là bất phương trình bậc nhất hai ẩn. x + 2y ≤ 6 thỏa dạng này.'),
   mc('Biết','Cặp số nào là nghiệm của x + y ≤ 3?', ['(2; 2)','(4; 0)','(0; 4)','(1; 1)'],3,'Thay (1; 1) được 1 + 1 = 2 ≤ 3; ba cặp còn lại đều cho tổng bằng 4.'),
   mc('Hiểu','Đường biên x + y = 4 cắt trục hoành tại điểm nào?', ['(0; 4)','(4; 0)','(−4; 0)','(0; −4)'],1,'Trên trục hoành y = 0; khi đó x = 4 nên giao điểm là (4; 0).'),
   mc('Hiểu','Điểm O(0; 0) có thuộc miền nghiệm của x + 2y > 2 không?', ['Có, vì 0 > 2.','Có, vì O thuộc mọi miền nghiệm.','Không, vì 0 không lớn hơn 2.','Không xác định vì thiếu x.'],2,'Thay x = y = 0, vế trái bằng 0; bất đẳng thức 0 > 2 sai nên O không thuộc miền nghiệm.'),
   mc('Vận dụng','Với x ≥ 0, y ≥ 0, x + 2y ≤ 6, giá trị lớn nhất của x + y bằng bao nhiêu?', ['3','6','9','12'],1,'Do y ≥ 0 nên x + y ≤ x + 2y ≤ 6. Dấu bằng đạt tại (x; y) = (6; 0), nên giá trị lớn nhất là 6.'),
   mc('Vận dụng','Xe nhỏ chở được 2 tấn, xe lớn chở được 3 tấn. Gọi x, y lần lượt là số xe nhỏ, xe lớn. Điều kiện nào biểu thị tổng sức chở ít nhất 12 tấn?', ['2x + 3y ≤ 12','3x + 2y ≥ 12','2x + 3y ≥ 12','x + y ≥ 12'],2,'Tổng sức chở là 2x + 3y tấn; “ít nhất 12” tương ứng ≥ 12, với x, y là các số nguyên không âm.'),
   es('Hiểu','Xét hệ x ≥ 0, y ≥ 0, x + y ≤ 4. Nêu vị trí miền nghiệm và tọa độ ba đỉnh của miền nghiệm.', ['x ≥ 0, y ≥ 0 giới hạn trong góc phần tư thứ nhất, kể cả hai trục.','Đường biên x + y = 4 cắt hai trục tại (4; 0) và (0; 4).','Thử O(0; 0) được 0 ≤ 4, chọn nửa mặt phẳng chứa O và đường biên.','Miền nghiệm là tam giác kể cả biên có ba đỉnh (0; 0), (4; 0), (0; 4).']),
   es('Vận dụng','Cơ sở làm hai sản phẩm A và B. Mỗi A dùng 1 giờ máy, mỗi B dùng 2 giờ máy; có tối đa 6 giờ máy. Lãi mỗi sản phẩm đều là 1 đơn vị tiền. Gọi x, y là số sản phẩm A, B, các số nguyên không âm. Lập ràng buộc và tìm phương án đạt lãi lớn nhất.', ['Đặt x, y là số nguyên không âm; ràng buộc thời gian x + 2y ≤ 6.','Biểu diễn tổng lãi L = x + y.','Do y ≥ 0, suy ra L = x + y ≤ x + 2y ≤ 6.','Chọn x = 6, y = 0 thỏa các ràng buộc; lãi lớn nhất là 6 đơn vị tiền.'])]),
  dict(code='B3', name='Hệ thức lượng trong tam giác', topic='Hệ thức lượng trong tam giác', outcomes=[
   'Nhận biết giá trị lượng giác cơ bản, định lí cosin và công thức diện tích.',
   'Giải thích cách dùng hệ thức lượng để tính cạnh hoặc diện tích tam giác.',
   'Vận dụng định lí sin, cosin và công thức diện tích để giải tam giác.'], questions=[
   mc('Biết','Giá trị của sin 30° bằng bao nhiêu?', ['1/2','√3/2','√2/2','1'],0,'Giá trị lượng giác cơ bản: sin 30° = 1/2.'),
   mc('Biết','Trong tam giác ABC, a, b, c lần lượt đối diện các góc A, B, C. Đẳng thức nào đúng theo định lí cosin?', ['a² = b² + c² + 2bc cos A','a² = b² + c² − 2bc cos A','a = b + c − 2bc cos A','a² = b² − c²'],1,'Định lí cosin phát biểu a² = b² + c² − 2bc cos A với A là góc xen giữa b và c.'),
   mc('Hiểu','Tam giác có hai cạnh dài 3 và 4, góc xen giữa 90°. Diện tích bằng bao nhiêu?', ['12','7','6','5'],2,'S = (1/2) × 3 × 4 × sin 90° = 6 đơn vị diện tích.'),
   mc('Hiểu','Tam giác có hai cạnh dài 5 và 7, góc xen giữa 60°. Bình phương cạnh đối diện góc 60° bằng bao nhiêu?', ['109','39','74','12'],1,'Theo cosin: a² = 5² + 7² − 2 × 5 × 7 × cos 60° = 74 − 35 = 39.'),
   mc('Vận dụng','Trong tam giác ABC có A = 30°, B = 90°, a = 5. Cạnh b dài bao nhiêu?', ['5','5√3','10','10√3'],2,'Theo định lí sin: b/sin 90° = 5/sin 30° = 10, nên b = 10.'),
   mc('Vận dụng','Một tam giác có ba cạnh 3, 4, 5. Bán kính đường tròn ngoại tiếp bằng bao nhiêu?', ['1','2','2,5','5'],2,'Vì 3² + 4² = 5², tam giác vuông có cạnh huyền 5. Bán kính ngoại tiếp bằng nửa cạnh huyền: R = 2,5.'),
   es('Hiểu','Tam giác ABC có AB = 6, AC = 8 và A = 90°. Tính BC và diện tích tam giác, trình bày các công thức sử dụng.', ['Nhận biết tam giác vuông tại A, dùng BC² = AB² + AC².','Tính BC² = 36 + 64 = 100, suy ra BC = 10.','Dùng S = (1/2) × AB × AC × sin A.','Tính S = (1/2) × 6 × 8 = 24 đơn vị diện tích.']),
   es('Vận dụng','Tam giác ABC có AB = AC = 6, A = 60°. Tính BC, diện tích và bán kính đường tròn ngoại tiếp.', ['Dùng BC² = 6² + 6² − 2 × 6 × 6 × cos 60° = 36.','Suy ra BC = 6; tam giác ABC đều.','Diện tích S = (1/2) × 6 × 6 × sin 60° = 9√3.','Dùng R = BC/(2 sin A) = 6/√3 = 2√3.'])])]),
 dict(code='vat-li', name='Vật lí', marker='sample-vat-li-10-v1', competency='NL_CHUNG', lessons=[
  dict(code='B1', name='Tốc độ, vận tốc và chuyển động thẳng đều', topic='Động học', outcomes=[
   'Nhận biết tốc độ, vận tốc, quãng đường, độ dịch chuyển và đơn vị SI.',
   'Giải thích quan hệ giữa quãng đường, độ dịch chuyển và vận tốc trong chuyển động thẳng.',
   'Vận dụng hệ thức chuyển động thẳng đều và tốc độ trung bình.'], questions=[
   mc('Biết','Đơn vị SI của tốc độ là gì?', ['km/h','m/s','m/s²','N'],1,'Trong hệ SI, quãng đường đo bằng mét và thời gian bằng giây nên tốc độ có đơn vị m/s.'),
   mc('Biết','Công thức tính quãng đường trong chuyển động thẳng đều với tốc độ v, thời gian t là gì?', ['s = v/t','s = t/v','s = vt','s = v + t'],2,'Tốc độ không đổi v = s/t nên s = vt.'),
   mc('Hiểu','Một người đi 3 m về phía đông rồi 3 m về phía tây và trở về điểm đầu. Độ lớn độ dịch chuyển bằng bao nhiêu?', ['0 m','3 m','6 m','9 m'],0,'Độ dịch chuyển nối vị trí đầu với vị trí cuối. Hai vị trí trùng nhau nên độ dịch chuyển bằng 0, dù quãng đường là 6 m.'),
   mc('Hiểu','Đổi 72 km/h sang m/s được giá trị nào?', ['10 m/s','15 m/s','20 m/s','25 m/s'],2,'1 km/h = 1/3,6 m/s, nên 72/3,6 = 20 m/s.'),
   mc('Vận dụng','Ô tô chuyển động thẳng đều với tốc độ 15 m/s trong 20 s. Quãng đường đi được bằng bao nhiêu?', ['35 m','300 m','0,75 m','150 m'],1,'Áp dụng s = vt = 15 × 20 = 300 m.'),
   mc('Vận dụng','Xe đi 60 km đầu với tốc độ 30 km/h, rồi đi 60 km tiếp theo với tốc độ 60 km/h. Không dừng giữa đường. Tốc độ trung bình cả hành trình bằng bao nhiêu?', ['45 km/h','40 km/h','50 km/h','90 km/h'],1,'Thời gian hai chặng là 2 h và 1 h. Tốc độ trung bình = 120/(2 + 1) = 40 km/h, không lấy trung bình cộng hai tốc độ.'),
   es('Hiểu','Người đi bộ đi 80 m theo chiều dương rồi quay lại 30 m trên cùng đường thẳng, trong tổng thời gian 50 s. Tính quãng đường, độ dịch chuyển, tốc độ trung bình và vận tốc trung bình.', ['Quãng đường s = 80 + 30 = 110 m.','Độ dịch chuyển d = 80 − 30 = +50 m.','Tốc độ trung bình = s/t = 110/50 = 2,2 m/s.','Vận tốc trung bình = d/t = +50/50 = +1 m/s theo chiều dương.']),
   es('Vận dụng','Hai xe cùng khởi hành từ hai điểm A và B cách nhau 300 m, chạy thẳng đều hướng vào nhau với tốc độ 10 m/s và 5 m/s. Tính thời gian gặp và quãng đường mỗi xe đi được đến khi gặp.', ['Tốc độ rút ngắn khoảng cách là 10 + 5 = 15 m/s.','Thời gian gặp t = 300/15 = 20 s.','Xe từ A đi s₁ = 10 × 20 = 200 m.','Xe từ B đi s₂ = 5 × 20 = 100 m; kiểm tra s₁ + s₂ = 300 m.'])]),
  dict(code='B2', name='Gia tốc và chuyển động thẳng biến đổi đều', topic='Động học', outcomes=[
   'Nhận biết gia tốc và các hệ thức chuyển động thẳng biến đổi đều.',
   'Giải thích dấu gia tốc và quan hệ giữa vận tốc, thời gian, độ dịch chuyển.',
   'Vận dụng các hệ thức chuyển động thẳng biến đổi đều trong tình huống đơn giản.'], questions=[
   mc('Biết','Đơn vị SI của gia tốc là gì?', ['m/s','m²/s','m/s²','N/s'],2,'Gia tốc a = Δv/Δt nên đơn vị là (m/s)/s = m/s².'),
   mc('Biết','Với gia tốc không đổi a, vận tốc đầu v₀ tại t = 0, vận tốc ở thời điểm t là gì?', ['v = v₀ + at','v = v₀t + a','v = at²','v = v₀/a'],0,'Từ a = (v − v₀)/t khi a không đổi, suy ra v = v₀ + at.'),
   mc('Hiểu','Chọn chiều dương theo chiều chuyển động. Ô tô đang chạy theo chiều dương và chậm dần đều. Gia tốc có dấu nào?', ['Luôn dương','Bằng 0','Âm','Không có đơn vị'],2,'Khi vận tốc dương giảm đều, Δv < 0 nên gia tốc âm; gia tốc ngược chiều vận tốc.'),
   mc('Hiểu','Vật bắt đầu chuyển động từ trạng thái nghỉ, gia tốc không đổi. Trong trường hợp này, quãng đường sau 2t bằng bao nhiêu lần quãng đường sau t?', ['2 lần','3 lần','4 lần','8 lần'],2,'Từ trạng thái nghỉ, s = (1/2)at²; thay t bằng 2t cho s tăng 4 lần.'),
   mc('Vận dụng','Xe có v₀ = 2 m/s, gia tốc a = 3 m/s², cùng chiều dương. Sau 4 s, vận tốc bằng bao nhiêu?', ['8 m/s','12 m/s','14 m/s','20 m/s'],2,'v = v₀ + at = 2 + 3 × 4 = 14 m/s.'),
   mc('Vận dụng','Xe đang chạy 20 m/s thì hãm phanh với gia tốc −4 m/s² đến khi dừng. Quãng đường hãm bằng bao nhiêu?', ['25 m','40 m','50 m','80 m'],2,'Dùng v² − v₀² = 2as: 0 − 400 = −8s, suy ra s = 50 m.'),
   es('Hiểu','Xe chuyển động thẳng từ trạng thái nghỉ với gia tốc không đổi 2 m/s². Tính vận tốc và quãng đường sau 5 s, nêu các công thức dùng.', ['Xác định v₀ = 0 và dùng v = v₀ + at.','Tính v = 0 + 2 × 5 = 10 m/s.','Dùng s = v₀t + (1/2)at² vì xe không đổi chiều.','Tính s = 0 + (1/2) × 2 × 25 = 25 m.']),
   es('Vận dụng','Ô tô đang chạy 15 m/s thì hãm phanh với gia tốc không đổi −3 m/s². Chọn chiều dương theo chiều chạy ban đầu. Tính thời gian dừng, quãng đường hãm và vận tốc sau 2 s.', ['Dùng 0 = 15 − 3t để tìm t dừng.','Tính t dừng = 5 s.','Dùng 0² − 15² = 2 × (−3) × s, được s = 37,5 m.','Sau 2 s (chưa dừng), v = 15 − 3 × 2 = 9 m/s.'])]),
  dict(code='B3', name='Lực và định luật II Newton', topic='Động lực học', outcomes=[
   'Nhận biết lực tổng hợp, khối lượng và định luật II Newton.',
   'Giải thích mối quan hệ giữa lực tổng hợp, khối lượng và gia tốc.',
   'Vận dụng định luật II Newton cho chuyển động trên đường thẳng.'], questions=[
   mc('Biết','Biểu thức độ lớn định luật II Newton khi lực tổng hợp và gia tốc cùng hướng là gì?', ['F = m/a','F = ma','F = a/m','F = mv'],1,'Định luật II Newton: vectơ F tổng hợp = m vectơ a; về độ lớn F = ma.'),
   mc('Biết','Đơn vị SI của lực là gì?', ['kg','m/s','N','J/s'],2,'Đơn vị lực là newton (N), với 1 N = 1 kg·m/s².'),
   mc('Hiểu','Giữ nguyên khối lượng, tăng độ lớn lực tổng hợp lên gấp đôi thì độ lớn gia tốc thay đổi thế nào?', ['Giảm một nửa','Không đổi','Gấp đôi','Gấp bốn'],2,'Theo a = F/m, khi m không đổi, gia tốc tỉ lệ thuận với lực tổng hợp.'),
   mc('Hiểu','Vật đang chuyển động thẳng, lực tổng hợp tác dụng bằng 0. Vật sẽ như thế nào trong hệ quy chiếu quán tính?', ['Dừng ngay','Chuyển động thẳng đều','Nhanh dần đều','Quay tròn đều'],1,'F tổng hợp = 0 dẫn đến a = 0; vận tốc giữ nguyên nên vật đang chuyển động sẽ tiếp tục thẳng đều.'),
   mc('Vận dụng','Vật khối lượng 2 kg chịu lực tổng hợp có độ lớn 6 N. Độ lớn gia tốc bằng bao nhiêu?', ['3 m/s²','4 m/s²','8 m/s²','12 m/s²'],0,'a = F/m = 6/2 = 3 m/s².'),
   mc('Vận dụng','Vật 4 kg trên mặt phẳng ngang chịu lực kéo 12 N theo chiều dương và lực ma sát 4 N ngược chiều. Các lực thẳng đứng cân bằng. Gia tốc theo phương ngang bằng bao nhiêu?', ['1 m/s²','2 m/s²','3 m/s²','4 m/s²'],1,'Lực tổng hợp ngang F = 12 − 4 = 8 N; a = F/m = 8/4 = 2 m/s² theo chiều dương.'),
   es('Hiểu','Vật khối lượng 3 kg chịu lực tổng hợp không đổi 12 N theo chiều dương. Tính gia tốc. Nếu giữ nguyên lực nhưng khối lượng tăng lên 6 kg thì gia tốc bằng bao nhiêu? Giải thích.', ['Nêu định luật II Newton: a = F/m.','Với m = 3 kg, a = 12/3 = 4 m/s² theo chiều dương.','Với m = 6 kg, a = 12/6 = 2 m/s² theo chiều dương.','Khi lực không đổi, khối lượng gấp đôi làm độ lớn gia tốc giảm một nửa.']),
   es('Vận dụng','Vật 2 kg ban đầu đứng yên trên mặt phẳng ngang. Lực kéo 10 N theo chiều dương và ma sát 2 N ngược chiều, đều không đổi. Các lực thẳng đứng cân bằng. Tính lực tổng hợp ngang, gia tốc, vận tốc và quãng đường sau 3 s.', ['F tổng hợp ngang = 10 − 2 = 8 N theo chiều dương.','a = F/m = 8/2 = 4 m/s².','v = 0 + at = 4 × 3 = 12 m/s.','s = (1/2)at² = (1/2) × 4 × 9 = 18 m.'])])])
]
