import { 
  Button,
  Input,
  Stack,
  Dialog,
  CloseButton
} from '@chakra-ui/react';
import { useState, useEffect } from 'react';

interface RenameFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRenameFile: (newName: string) => void;
  currentFileName: string;
}

export function RenameFileModal({
  isOpen,
  onClose,
  onRenameFile,
  currentFileName
}: RenameFileModalProps) {
  const [newName, setNewName] = useState(currentFileName);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNewName(currentFileName);
    }
  }, [currentFileName, isOpen]);

  const handleSubmit = async () => {
    if (!newName) {
      return;
    }

    setIsSubmitting(true);
    
    try {
      await onRenameFile(newName);
      handleClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setNewName(currentFileName);
    onClose();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={({ open }) => !open && handleClose()}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Rename File</Dialog.Title>
            <Dialog.CloseTrigger asChild>
              <CloseButton />
            </Dialog.CloseTrigger>
          </Dialog.Header>
          <Dialog.Body>
            <Stack gap={4}>
              <div>
                <label htmlFor="newFileName" style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                  New File Name <span style={{ color: 'red' }}>*</span>
                </label>
                <Input
                  id="newFileName"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="config.yaml"
                />
              </div>
            </Stack>
          </Dialog.Body>
          <Dialog.Footer>
            <Button variant="ghost" mr={3} onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              colorPalette="blue" 
              onClick={handleSubmit} 
              loading={isSubmitting}
            >
              Rename
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
