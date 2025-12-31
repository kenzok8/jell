import { 
  Button,
  Input,
  Stack,
  Dialog,
  CloseButton,
  Text,
  Box
} from '@chakra-ui/react';
import { useState, useRef } from 'react';
import { Upload } from 'lucide-react';
import { API_BASE_URL } from '../../config/api';
import { showSuccess, showError } from '../../utils/notification';

interface UploadFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  uploadEndpoint?: string;
  title?: string;
}

export function UploadFileModal({
  isOpen,
  onClose,
  onSuccess,
  uploadEndpoint = `${API_BASE_URL}/api/v1/mihomo/configs/upload`,
  title = 'Upload Config File'
}: UploadFileModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      showError('Error', { description: 'Please select a file to upload' });
      return;
    }

    const fileExt = selectedFile.name.split('.').pop()?.toLowerCase();
    if (fileExt !== 'yaml' && fileExt !== 'yml') {
      showError('Error', { description: 'Only YAML files (.yaml, .yml) are allowed' });
      return;
    }

    setIsSubmitting(true);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch(uploadEndpoint, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload file');
      }

      const data = await response.json();
      showSuccess('Success', { description: data.message || 'File uploaded successfully' });
      handleClose();
      onSuccess();
    } catch (error) {
      console.error('Error uploading file:', error);
      showError('Error', { 
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={({ open }) => !open && handleClose()}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.CloseTrigger asChild>
              <CloseButton />
            </Dialog.CloseTrigger>
          </Dialog.Header>
          <Dialog.Body>
            <Stack gap={4}>
              <div>
                <label htmlFor="configFile" style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                  Select YAML File
                </label>
                <Input
                  id="configFile"
                  type="file"
                  accept=".yaml,.yml"
                  onChange={handleFileChange}
                  ref={fileInputRef}
                />
              </div>
              
              {selectedFile && (
                <Box p={3} borderWidth="1px" borderRadius="md" bg="bg.muted">
                  <Text fontWeight="medium">Selected file: {selectedFile.name}</Text>
                  <Text fontSize="sm" color="fg.muted">Size: {(selectedFile.size / 1024).toFixed(2)} KB</Text>
                </Box>
              )}
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
              <Upload size={16} style={{ marginRight: '8px' }} />
              Upload
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
