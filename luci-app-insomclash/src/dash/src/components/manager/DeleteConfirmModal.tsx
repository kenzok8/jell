import { 
  Button,
  Stack,
  Dialog,
  CloseButton,
  Text,
  Box,
  Flex
} from '@chakra-ui/react';
import { AlertTriangle } from 'lucide-react';
// No React import needed

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  fileName: string;
  isLoading?: boolean;
}

export function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  fileName,
  isLoading = false
}: DeleteConfirmModalProps) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={({ open }) => !open && onClose()}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content maxWidth="400px">
          <Dialog.Header>
            <Dialog.Title>Confirm Delete</Dialog.Title>
            <Dialog.CloseTrigger asChild>
              <CloseButton />
            </Dialog.CloseTrigger>
          </Dialog.Header>
          <Dialog.Body>
            <Stack gap={4}>
              <Flex alignItems="center" gap={3}>
                <Box 
                  p={2} 
                  borderRadius="full" 
                  bg="red.muted" 
                  color="red.fg"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <AlertTriangle size={24} />
                </Box>
                <Box>
                  <Text fontWeight="bold" fontSize="lg">Delete {fileName}?</Text>
                  <Text color="fg.muted">This action cannot be undone.</Text>
                </Box>
              </Flex>
              <Box 
                p={3} 
                borderRadius="md" 
                bg="bg.muted" 
                borderLeft="4px solid" 
                borderLeftColor="red.DEFAULT"
              >
                <Text>
                  Are you sure you want to delete <Text as="span" fontWeight="bold">{fileName}</Text>?
                </Text>
              </Box>
            </Stack>
          </Dialog.Body>
          <Dialog.Footer>
            <Button variant="ghost" mr={3} onClick={onClose}>
              Cancel
            </Button>
            <Button 
              colorPalette="red" 
              onClick={onConfirm}
              loading={isLoading}
            >
              Delete
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
