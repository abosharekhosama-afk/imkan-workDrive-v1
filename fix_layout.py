import os

# جميع الملفات التي تم تعديلها
files_to_clean = [
    'E:/imkan workdrive/imkan-workDrive-v1-last-v/frontend/src/app/files/workflows/page.tsx',
    'E:/imkan workdrive/imkan-workDrive-v1-last-v/frontend/src/app/files/workflows/builder/page.tsx',
    'E:/imkan workdrive/imkan-workDrive-v1-last-v/frontend/src/app/files/workflows/runs/page.tsx',
    'E:/imkan workdrive/imkan-workDrive-v1-last-v/frontend/src/app/files/workflows/tasks/page.tsx',
    'E:/imkan workdrive/imkan-workDrive-v1-last-v/frontend/src/app/files/templates/page.tsx',
    'E:/imkan workdrive/imkan-workDrive-v1-last-v/frontend/src/app/files/shared-links/page.tsx',
]

for filepath in files_to_clean:
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        # إزالة الأسطر الفارغة الزائدة
        cleaned_lines = []
        prev_empty = False
        for line in lines:
            is_empty = line.strip() == ''
            if is_empty and prev_empty:
                continue  # تخطي السطر الفارغ المتتالي
            cleaned_lines.append(line)
            prev_empty = is_empty
        
        # إزالة الأسطر الفارغة في البداية والنهاية
        while cleaned_lines and cleaned_lines[0].strip() == '':
            cleaned_lines.pop(0)
        while cleaned_lines and cleaned_lines[-1].strip() == '':
            cleaned_lines.pop()
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.writelines(cleaned_lines)
        
        print(f'Cleaned: {filepath}')

print('Cleaning done!')

