# KLEats backend

KLEats backend is a Node.js/Express backend for managing canteen, user, and order operations for a lunch box service. It supports admin, canteen, user, explore, telegram, and WhatsApp integrations.

## Features
- User authentication and management
- Admin and canteen management
- Item and category management
- Cart and order processing
- Payment gateway integration (Cashfree)
- Telegram and WhatsApp bot support
- Redis and MySQL database support
- Modular controllers and routers

## Project Structure
```
Config/           # Database and Redis configuration
Controller/       # Business logic for Admin, Canteen, Explore, Telegram, User
MiddleWare/       # Authentication and authorization middleware
router/           # Express routers for API endpoints
Services/         # External service integrations (mail, telegram, whatsapp, payment)
server.js         # Entry point
package.json      # Project dependencies
LICENSE           # License file
```

## License
This project is licensed under the terms of the GNU GENERAL PUBLIC LICENSE. See the LICENSE file for details.
