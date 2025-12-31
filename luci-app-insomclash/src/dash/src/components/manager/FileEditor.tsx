import { Box, Button, Flex, Text } from '@chakra-ui/react';
import * as React from 'react';
import { AlertTriangle, Download, Pencil, X, Save, Maximize, Minimize } from 'lucide-react';
import { Editor } from '@monaco-editor/react';
import { API_BASE_URL } from '../../config/api';
import { useTheme } from '../../contexts/ThemeContext';

interface FileEditorProps {
  fileContent: string;
  selectedFile: string;
  isEditing: boolean;
  isLoading: boolean;
  onEditClick: () => void;
  onSaveClick: () => void;
  onContentChange: (value: string | undefined) => void;
  onCancelEdit?: () => void;
}

export function FileEditor({
  fileContent,
  selectedFile,
  isEditing,
  isLoading,
  onEditClick,
  onSaveClick,
  onContentChange,
  onCancelEdit
}: FileEditorProps) {
  const [originalContent, setOriginalContent] = React.useState(fileContent);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  React.useEffect(() => {
    if (!isEditing) {
      setOriginalContent(fileContent);
    }
  }, [selectedFile, fileContent, isEditing]);

  const handleCancel = () => {
    if (onCancelEdit) {
      onCancelEdit();
    } else {
      if (onEditClick) onEditClick();
    }
    onContentChange(originalContent);
  };
  const { isDark } = useTheme();

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <Box width="100%" height="100%">
      {selectedFile ? (
        <>
          <Box
            borderWidth={isFullscreen ? "0" : "1px"}
            borderRadius={isFullscreen ? "0" : "md"}
            height={isFullscreen ? "100vh" : "calc(100% - 50px)"}
            overflow="hidden"
            position={isFullscreen ? "fixed" : "relative"}
            top={isFullscreen ? 0 : "auto"}
            left={isFullscreen ? 0 : "auto"}
            zIndex={isFullscreen ? 9999 : "auto"}
            width={isFullscreen ? "100vw" : "auto"}
            bg={isDark ? "gray.900" : "white"}
            mb={isFullscreen ? 0 : 3}
          >
            <Editor
              height="100%"
              language="yaml"
              value={fileContent}
              onChange={onContentChange}
              theme={isDark ? 'vs-dark' : 'light'}
              options={{
                readOnly: !isEditing,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
              loading={isLoading ? "Loading editor..." : undefined}
            />

            {/* Fullscreen Toggle Button - Floating when fullscreen */}
            <Button
              position="absolute"
              top={2}
              right={4}
              zIndex={100}
              size="xs"
              variant="subtle"
              colorPalette="gray"
              onClick={toggleFullscreen}
              opacity={0.7}
              _hover={{ opacity: 1 }}
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </Button>
          </Box>

          <Flex gap={{ base: 1, md: 3 }} justifyContent="flex-end">
            {!isFullscreen && (
              <Button
                colorPalette="gray"
                size={{ base: "2xs", md: "xs" }}
                fontSize={{ base: "xs", md: "sm" }}
                onClick={toggleFullscreen}
                display={{ base: "none", md: "flex" }}
              >
                <Maximize size={12} style={{ marginRight: '4px' }} />
                Fullscreen
              </Button>
            )}

            <Button
              colorPalette="cyan"
              size={{ base: "2xs", md: "xs" }}
              fontSize={{ base: "xs", md: "sm" }}
              onClick={() => {
                window.open(`${API_BASE_URL}/api/v1/mihomo/configs/${selectedFile}/download`, '_blank');
              }}
            >
              <Download size={12} style={{ marginRight: '4px' }} />
              Download
            </Button>

            {isEditing ? (
              <>
                <Button
                  colorPalette="green"
                  size={{ base: "2xs", md: "xs" }}
                  fontSize={{ base: "xs", md: "sm" }}
                  onClick={onSaveClick}
                >
                  <Save size={12} style={{ marginRight: '4px' }} />
                  Save
                </Button>
                <Button
                  colorPalette="red"
                  size={{ base: "2xs", md: "xs" }}
                  fontSize={{ base: "xs", md: "sm" }}
                  onClick={handleCancel}
                >
                  <X size={12} style={{ marginRight: '4px' }} />
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                colorPalette="blue"
                size={{ base: "2xs", md: "xs" }}
                fontSize={{ base: "xs", md: "sm" }}
                onClick={onEditClick}
              >
                <Pencil size={12} style={{ marginRight: '4px' }} />
                Edit
              </Button>
            )}
          </Flex>
        </>
      ) : (
        <Box
          height="100%"
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          bg="bg.surface"
          borderRadius="md"
          borderWidth="1px"
          p={4}
        >
          <Box
            bg="blue.muted"
            color="blue.fg"
            p={4}
            borderRadius="md"
            mb={4}
            maxW="md"
            display="flex"
            alignItems="flex-start"
          >
            <AlertTriangle size={16} style={{ marginRight: '12px', marginTop: '2px' }} />
            <Box>
              <Text fontWeight="bold">Select a file to edit</Text>
              <Text fontSize="sm">
                Please select a file from the list on the left to view and edit its content.
              </Text>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
