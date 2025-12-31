import { 
  Button,
  Input,
  Stack,
  Dialog,
  CloseButton
} from '@chakra-ui/react';
import { Editor } from '@monaco-editor/react';
import { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

interface CreateFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateFile: (filename: string, content: string) => void;
  initialFileName?: string;
  initialContent?: string;
  title?: string;
  placeholder?: string;
  defaultContent?: string;
}

export function CreateFileModal({
  isOpen,
  onClose,
  onCreateFile,
  initialFileName = '',
  initialContent = '# New config file',
  title = 'Create New Config File',
  placeholder = 'config.yaml',
  defaultContent = '# New config file'
}: CreateFileModalProps) {
  const [fileName, setFileName] = useState(initialFileName);
  const [content, setContent] = useState(initialContent);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isDark } = useTheme();

  const handleSubmit = async () => {
    if (!fileName) {
      return;
    }

    setIsSubmitting(true);
    
    try {
      await onCreateFile(fileName, content);
      handleClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFileName(initialFileName);
    setContent(defaultContent || initialContent);
    onClose();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={({ open }) => !open && handleClose()}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content maxWidth="800px">
          <Dialog.Header>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.CloseTrigger asChild>
              <CloseButton />
            </Dialog.CloseTrigger>
          </Dialog.Header>
          <Dialog.Body>
            <Stack gap={4}>
              <div>
                <label htmlFor="fileName" style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                  File Name <span style={{ color: 'red' }}>*</span>
                </label>
                <Input
                  id="fileName"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder={placeholder}
                />
              </div>
              <div>
                <label htmlFor="content" style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                  Content
                </label>
                <Editor
                  height="300px"
                  language="yaml"
                  value={content}
                  onChange={(value) => setContent(value || '')}
                  theme={isDark ? 'vs-dark' : 'light'}
                  options={{
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                  }}
                />
              </div>
            </Stack>
          </Dialog.Body>
          <Dialog.Footer>
            <Button variant="ghost" mr={3} onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              colorPalette="green" 
              onClick={handleSubmit} 
              loading={isSubmitting}
            >
              Create
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
