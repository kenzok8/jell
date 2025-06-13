#!/bin/sh

# Copyright (c) 2023 bobbyunknown
# https://github.com/bobbyunknown
# 
# Hak Cipta Dilindungi Undang-Undang
# https://rem.mit-license.org/

PACKAGE_NAME="luci-app-insomclash"
MIHOMO="mihomo"
OWNER="bobbyunknown"
REPO="Openwrt-Insomclash"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

detect_architecture() {
    ARCH=$(grep '^OPENWRT_ARCH=' /etc/os-release | sed 's/OPENWRT_ARCH=//' | tr -d '"')
}

get_latest_release() {
    curl -s https://api.github.com/repos/$OWNER/$REPO/releases/latest \
    | jq -r '.assets[].browser_download_url'
}

update_owrt() {
    echo -e "${BLUE}Updating package list...${NC}"
    if ! opkg update; then
        echo -e "${RED}Error: Failed to update package list!${NC}"
        exit 1
    fi
    echo -e "${GREEN}Package list updated successfully${NC}"
}

download_package() {
    MIHOMO_URL=$(get_latest_release | grep "$MIHOMO.*${ARCH}.ipk")
    LUCI_URL=$(get_latest_release | grep "$PACKAGE_NAME.*all.ipk")
    
    if [ -z "$MIHOMO_URL" ]; then
        echo -e "${RED}Error: Cannot find mihomo package for architecture $ARCH${NC}"
        exit 1
    fi

    if [ -f "/tmp/$MIHOMO.ipk" ]; then
        echo -e "${YELLOW}Removing existing $MIHOMO.ipk...${NC}"
        rm -f "/tmp/$MIHOMO.ipk"
    fi
    
    if [ -f "/tmp/$PACKAGE_NAME.ipk" ]; then
        echo -e "${YELLOW}Removing existing $PACKAGE_NAME.ipk...${NC}"
        rm -f "/tmp/$PACKAGE_NAME.ipk"
    fi
    
    echo -e "${BLUE}Downloading $MIHOMO...${NC}"
    curl -L -o /tmp/$MIHOMO.ipk "$MIHOMO_URL"
    
    echo -e "${BLUE}Downloading $PACKAGE_NAME...${NC}"
    curl -L -o /tmp/$PACKAGE_NAME.ipk "$LUCI_URL"
}

install_package() {
    cd /tmp
    opkg install $MIHOMO*.ipk
    opkg install $PACKAGE_NAME*.ipk
}

remove_package() {
    opkg remove $MIHOMO
    opkg remove $PACKAGE_NAME
}

show_menu() {
    clear
    echo -e "${BLUE}┌─────────────────────────────────────┐${NC}"
    echo -e "${BLUE}│${NC}    ${YELLOW}luci-app-insomclash Installer${NC}    ${BLUE}│${NC}"
    echo -e "${BLUE}│${NC}     ${GREEN}github.com/bobbyunknown${NC}         ${BLUE}│${NC}"
    echo -e "${BLUE}├─────────────────────────────────────┤${NC}"
    echo -e "${BLUE}│${NC}                                     ${BLUE}│${NC}"
    echo -e "${BLUE}│${NC}  ${YELLOW}Architecture:${NC} ${GREEN}$ARCH${NC}                    ${BLUE}│${NC}"
    echo -e "${BLUE}│${NC}                                     ${BLUE}│${NC}"
    echo -e "${BLUE}│${NC}  ${YELLOW}1.${NC} Install luci-app-insomclash     ${BLUE}│${NC}"
    echo -e "${BLUE}│${NC}  ${YELLOW}2.${NC} Uninstall                       ${BLUE}│${NC}"
    echo -e "${BLUE}│${NC}  ${YELLOW}3.${NC} Exit                            ${BLUE}│${NC}"
    echo -e "${BLUE}│${NC}                                     ${BLUE}│${NC}"
    echo -e "${BLUE}└─────────────────────────────────────┘${NC}"
}

main() {
    detect_architecture
    
    while true; do
        show_menu
        read -p "Select menu (1-3): " choice
        
        case $choice in
            1)
                echo -e "${BLUE}Starting Insomclash installation...${NC}"
                if ! update_owrt; then
                    echo -e "${RED}Installation cancelled due to package update failure${NC}"
                    read -p "Press Enter to continue..."
                    continue
                fi
                download_package
                install_package
                echo -e "${GREEN}Installation completed!${NC}"
                ;;
            2)
                echo -e "${BLUE}Removing Insomclash...${NC}"
                remove_package
                echo -e "${GREEN}Removal completed!${NC}"
                ;;
            3)
                echo -e "${BLUE}Exiting installer...${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid choice. Please select 1-3.${NC}"
                ;;
        esac
        
        echo ""
        read -p "Press Enter to continue..."
    done
}

main