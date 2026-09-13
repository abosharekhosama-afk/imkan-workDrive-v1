import os

path = 'E:/imkan workdrive/imkan-workDrive-v1-last-v/frontend/src/app/files/shared-links/page.tsx'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# إيجاد جزء return وإصلاحه
old_return = '''  return (
    
      <div className="flex min-h-0 flex-1 flex-col">'''

new_return = '''  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">'''

content = content.replace(old_return, new_return)

# إيجاد نهاية المحتوى وإغلاق Fragment
old_end = '''      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    
  );
}'''

new_end = '''      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}'''

content = content.replace(old_end, new_end)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Fixed shared-links/page.tsx')
