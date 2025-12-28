import { useRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownToolbar } from './MarkdownToolbar';

interface MarkdownTextareaProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

export function MarkdownTextarea({ id, value, onChange, placeholder, rows = 4 }: MarkdownTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div>
      <MarkdownToolbar
        textareaRef={textareaRef}
        value={value}
        onChange={onChange}
      />
      <Textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="rounded-t-none"
      />
    </div>
  );
}
