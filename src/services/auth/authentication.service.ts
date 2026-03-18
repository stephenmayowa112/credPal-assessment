import {
  Injectable,
  ConflictException,
  BadRequestException,
  Logger,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../../entities/user.entity';
import { OTP } from '../../entities/otp.entity';
import { Wallet } from '../../entities/wallet.entity';
import { WalletBalance } from '../../entities/wallet-balance.entity';
import { EmailService } from '../email/email.service';
import {
  RegisterDto,
  VerifyEmailDto,
  LoginDto,
  RefreshTokenDto,
  ResendOTPDto,
} from '../../common/dto/auth.dto';

interface JwtPayload {
  sub: string;
  email: string;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

interface RefreshTokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

@Injectable()
export class AuthenticationService {
  private readonly logger = new Logger(AuthenticationService.name);
  private readonly OTP_EXPIRATION_MINUTES = 10;
  private readonly INITIAL_NGN_BALANCE = 1000.000000;
  private readonly BCRYPT_COST_FACTOR = 10;
  private readonly ACCESS_TOKEN_EXPIRATION = '15m';
  private readonly REFRESH_TOKEN_EXPIRATION = '7d';

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(OTP)
    private otpRepository: Repository<OTP>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(WalletBalance)
    private walletBalanceRepository: Repository<WalletBalance>,
    private emailService: EmailService,
    private jwtService: JwtService,
  ) {}

  /**
   * Register a new user
   */
  async register(registerDto: RegisterDto): Promise<{ userId: string; message: string }> {
    const { email, password } = registerDto;

    // Validate email format
    if (!this.isValidEmail(email)) {
      throw new BadRequestException('Invalid email format');
    }

    // Validate password length
    if (password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    // Check for existing user
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Start transaction
    const queryRunner = this.userRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Hash password
      const passwordHash = await bcrypt.hash(password, this.BCRYPT_COST_FACTOR);
      
      // Create user
      const user = this.userRepository.create({
        email,
        passwordHash: passwordHash,
        isVerified: false,
      });
      
      const savedUser = await queryRunner.manager.save(user);

      // Generate OTP
      const otpCode = this.generateOTP();
      const otpHash = await bcrypt.hash(otpCode, this.BCRYPT_COST_FACTOR);
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + this.OTP_EXPIRATION_MINUTES);

      // Create OTP record
      const otp = this.otpRepository.create({
        userId: savedUser.id,
        otpHash,
        expiresAt,
        isUsed: false,
      });
      await queryRunner.manager.save(otp);

      // Create wallet
      const wallet = this.walletRepository.create({
        userId: savedUser.id,
      });
      const savedWallet = await queryRunner.manager.save(wallet);

      // Create initial NGN balance
      const walletBalance = this.walletBalanceRepository.create({
        walletId: savedWallet.id,
        currency: 'NGN',
        balance: this.INITIAL_NGN_BALANCE,
      });
      await queryRunner.manager.save(walletBalance);

      // Commit transaction
      await queryRunner.commitTransaction();

      // Send OTP email (outside transaction)
      try {
        await this.emailService.sendOTP(email, otpCode);
        this.logger.log(`OTP email sent to ${email}`);
      } catch (emailError) {
        this.logger.error(`Failed to send OTP email to ${email}:`, emailError);
        // Continue even if email fails
      }

      return {
        userId: savedUser.id,
        message: 'Registration successful. Please check your email for OTP verification.',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Registration failed:', error);
      throw new BadRequestException('Registration failed. Please try again.');
    } finally {
      await queryRunner.release();
    }
  }
  /**
   * Verify user email with OTP
   */
  async verifyEmail(verifyEmailDto: VerifyEmailDto): Promise<{ success: boolean; message: string }> {
    const { userId, otp } = verifyEmailDto;

    // Start transaction
    const queryRunner = this.userRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Find the most recent unused OTP for the user
      const otpRecord = await queryRunner.manager.findOne(OTP, {
        where: {
          userId,
          isUsed: false,
        },
        order: {
          createdAt: 'DESC',
        },
      });

      // Check if OTP exists
      if (!otpRecord) {
        throw new BadRequestException('No valid OTP found for this user');
      }

      // Check if OTP is expired
      const now = new Date();
      if (now > otpRecord.expiresAt) {
        throw new BadRequestException('OTP has expired');
      }

      // Compare provided OTP with hashed OTP
      const isOtpValid = await bcrypt.compare(otp, otpRecord.otpHash);
      if (!isOtpValid) {
        throw new BadRequestException('Invalid OTP');
      }

      // Find user
      const user = await queryRunner.manager.findOne(User, {
        where: { id: userId },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      // Mark user as verified
      user.isVerified = true;
      user.updatedAt = new Date();
      await queryRunner.manager.save(user);

      // Mark OTP as used
      otpRecord.isUsed = true;
      await queryRunner.manager.save(otpRecord);

      // Commit transaction
      await queryRunner.commitTransaction();

      this.logger.log(`User ${userId} email verified successfully`);

      return {
        success: true,
        message: 'Email verified successfully',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // If it's already a BadRequestException, rethrow it
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error('Email verification failed:', error);
      throw new BadRequestException('Email verification failed. Please try again.');
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Login verified user and issue access/refresh tokens
   */
  async login(loginDto: LoginDto): Promise<LoginResponse> {
    const { email, password } = loginDto;

    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isVerified) {
      throw new ForbiddenException('Email not verified');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: this.ACCESS_TOKEN_EXPIRATION,
      algorithm: 'HS256',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: this.REFRESH_TOKEN_EXPIRATION,
      algorithm: 'HS256',
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: 15 * 60,
    };
  }

  /**
   * Validate refresh token and issue a fresh access token
   */
  async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<RefreshTokenResponse> {
    const { refreshToken } = refreshTokenDto;

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const accessToken = await this.jwtService.signAsync(
      {
        sub: payload.sub,
        email: payload.email,
      },
      {
        secret: process.env.JWT_SECRET,
        expiresIn: this.ACCESS_TOKEN_EXPIRATION,
        algorithm: 'HS256',
      },
    );

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 15 * 60,
    };
  }

  /**
   * Resend OTP and invalidate all previously unused OTPs
   */
  async resendOTP(resendOtpDto: ResendOTPDto): Promise<{ success: boolean; message: string }> {
    const { userId } = resendOtpDto;

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.isVerified) {
      throw new BadRequestException('User is already verified');
    }

    const queryRunner = this.userRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.update(
        OTP,
        {
          userId,
          isUsed: false,
        },
        {
          isUsed: true,
        },
      );

      const otpCode = this.generateOTP();
      const otpHash = await bcrypt.hash(otpCode, this.BCRYPT_COST_FACTOR);
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + this.OTP_EXPIRATION_MINUTES);

      const otp = this.otpRepository.create({
        userId,
        otpHash,
        expiresAt,
        isUsed: false,
      });

      await queryRunner.manager.save(otp);
      await queryRunner.commitTransaction();

      try {
        await this.emailService.sendOTP(user.email, otpCode);
      } catch (emailError) {
        this.logger.error(`Failed to resend OTP email to ${user.email}:`, emailError);
      }

      return {
        success: true,
        message: 'OTP resent successfully',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Resend OTP failed:', error);
      throw new BadRequestException('Failed to resend OTP. Please try again.');
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Generate a 6-digit OTP
   */
  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email);
  }
}