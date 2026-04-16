# HTServeFS - High-Performance File Server



**Version:** 1.0.1  
**Status:** Stable Release  
**Platform:** Windows, Linux, macOS

## 🚀 Overview

HTServeFS is a modern, high-performance file server solution designed for fast and secure file transfers. Built with Go and React, it provides a web-based interface for managing and sharing files with advanced security features and real-time monitoring.

## ✅ Stable Release

**HTServeFS 1.0.1 is now a stable release ready for production use.**

- ✅ **Fully tested** and optimized for production environments
- 🔧 **All core features** are complete and stable
- 📝 **Regular updates** with new features and improvements
- 🚀 **Recommended for production** and critical environments
- 🛡️ **Enhanced security** and performance optimizations

We continue to welcome your feedback and feature requests!

## ✨ Key Features

### 🔒 Security & Authentication
- **JWT-based authentication** with role-based access control
- **Multi-user support** (Admin, Read-Write, Read-Only roles)
- **HTTPS/TLS encryption** for secure data transmission
- **Configurable access permissions** per directory
- **Session management** with automatic logout

### 📁 File Management
- **Unlimited file size transfers** with optimized streaming
- **Direct peer-to-peer connections** without intermediaries
- **Selective folder access** configuration
- **Real-time file explorer** with modern UI
- **Batch operations** for multiple files
- **File integrity verification** with hash checksums

### 🖥️ User Interface
- **Modern React-based web interface**
- **Responsive design** for desktop and mobile
- **Dark/Light theme support**
- **Real-time progress indicators**
- **Intuitive navigation** and file management
- **Multi-language support** (English/Italian)

### 📊 Monitoring & Logging
- **Real-time bandwidth monitoring**
- **User activity tracking**
- **Comprehensive logging system**
- **Performance metrics dashboard**
- **System health indicators**

### 🔄 Advanced Features
- **Automatic updates** via GitHub integration
- **RESTful API** for third-party integrations
- **Configurable server settings**
- **Cross-platform compatibility**
- **Lightweight and efficient** resource usage

## 🛠️ Installation

### Quick Start
1. Download the latest `htservefs.exe` from [GitHub Releases](https://github.com/lusp75/HTserveFS/releases)
2. Run the executable - no installation required!
3. Access the web interface at `http://localhost:8000`
4. Default login: `admin` / `admin` (change immediately)

### Configuration
- Edit `config.json` to customize server settings
- Configure SSL certificates for HTTPS
- Set up user accounts and permissions
- Define accessible directories

## 🌐 System Requirements

- **Operating System:** Windows 10+, Linux, macOS
- **RAM:** 512MB minimum, 1GB recommended
- **Storage:** 50MB for application + space for shared files
- **Network:** TCP ports 8000 (HTTP) and 8001 (HTTPS)

## 📖 Usage

### For Administrators
1. **User Management:** Create and manage user accounts
2. **Security Settings:** Configure authentication and permissions
3. **File Access:** Define which directories users can access
4. **Monitoring:** Track system performance and user activity

### For Users
1. **File Explorer:** Browse and navigate shared directories
2. **Upload/Download:** Transfer files with progress tracking
3. **Search:** Find files quickly across accessible folders
4. **Dashboard:** View personal usage statistics

## 🔧 Technical Specifications

- **Backend:** Go 1.21+ with Gin framework
- **Frontend:** React 18+ with TypeScript
- **Database:** JSON-based configuration (SQLite planned)
- **Protocols:** HTTP/HTTPS, WebSocket for real-time updates
- **Authentication:** JWT tokens with configurable expiration
- **File Handling:** Streaming for large files, chunked uploads

## 🐛 Known Issues (Beta)

- Some UI elements may not be fully responsive on very small screens
- Bulk file operations may be slow for large numbers of files
- Advanced logging features are still being refined
- Some error messages may not be fully localized

## 🤝 Contributing & Feedback

As this is a beta release, we welcome:
- **Bug reports** with detailed reproduction steps
- **Feature requests** and suggestions
- **Performance feedback** from real-world usage
- **UI/UX improvements** recommendations

Please report issues on our [GitHub Issues page](https://github.com/lusp75/HTserveFS/issues).

## 📋 Roadmap

### Upcoming Features (v1.1.0)
- Database integration for better user management
- Advanced file versioning
- API rate limiting and throttling
- Enhanced mobile interface
- Plugin system for extensions

### Future Releases
- Cloud storage integration
- Advanced search with filters
- File sharing with expiration links
- Audit logs and compliance features

## 📄 License

HTServeFS is released under the MIT License. See LICENSE file for details.

## 🔗 Links

- **Project Page:** [GitHub](https://github.com/lusp75/HTserveFS)
- **Downloads:** [Latest Releases](https://github.com/lusp75/HTserveFS/releases)
- **Documentation:** [User Guide](https://github.com/lusp75/HTserveFS)

---

**⚡ Fast • 🔒 Secure • 🌐 Modern • 🚀 Efficient**

*HTServeFS - Redefining file server performance and usability.*
