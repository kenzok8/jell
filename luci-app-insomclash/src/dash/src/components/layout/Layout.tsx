import { Box } from '@chakra-ui/react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { Toaster } from '../ui/toaster';

export function Layout() {
  return (
    <Box minH="100vh" bg="bg.DEFAULT" display="flex" flexDirection="column">
      <Navbar />
      <Box as="main" flex="1" maxW="7xl" mx="auto" px={{ base: 4, md: 8, lg: 12 }} py={8} pt={{ base: 20, md: 24 }} w="full">
        <Outlet />
      </Box>
      <Footer />
      <Toaster />
    </Box>
  );
}
