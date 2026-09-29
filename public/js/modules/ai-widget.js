export async function mountAiWidget(rootId = 'aiChatboxRoot') {
    const root = document.getElementById(rootId);
    if (!root) return;
    const response = await fetch('/components/ai-chatbox.html', { credentials: 'include' });
    if (!response.ok) throw new Error('Không thể tải hộp chat.');
    root.innerHTML = await response.text();
    root.querySelectorAll('script').forEach(oldScript => {
        const script = document.createElement('script');
        for (const attribute of oldScript.attributes) script.setAttribute(attribute.name, attribute.value);
        script.textContent = oldScript.textContent;
        oldScript.replaceWith(script);
    });
}

document.addEventListener('DOMContentLoaded', () => mountAiWidget().catch(() => {}));
